# Product-Core Self-Sufficiency, Optimization, and Streamlining Plan

## Mission

Make `product-core` self-sufficient as the production runtime while keeping `web-ts` available as a **read-only A/B testing and parity reference**.

This plan combines:

1. Product-core migration/production-readiness batches.
2. Code-bloat and streamlining batches.
3. CPU and sonic-quality validation.
4. Native/background-audio production evidence.

The goal is **not** to delete or rewrite `web-ts`. The goal is to remove production dependence on it.

---

## Hard rule: do not touch web-ts

The coding agent must follow these rules:

```text
DO NOT modify:
- src/audio/reference/webTs/**
- web-ts DSP behavior
- web-ts graph behavior
- web-ts runtime semantics
- web-ts parity/reference behavior
```

Allowed uses of `web-ts`:

```text
- read source for comparison
- run A/B tests
- run reference/parity harnesses
- document product-core differences
- compare product-core output/behavior against web-ts
```

Forbidden uses of `web-ts`:

```text
- changing web-ts to make product-core look better
- deleting web-ts
- using web-ts as a production fallback
- routing production UI through web-ts
- making product-core depend on web-ts internals
- fixing product-core bugs by patching web-ts
```

If a fix requires changing `src/audio/reference/webTs/**`, stop and report why. Do not proceed.

---

## Definition of done

The product-core self-sufficiency goal is complete when:

```text
[ ] Product-core is the only production runtime.
[ ] ProductEngineProxy remains the production runtime decision point.
[ ] ProductEnginePort/productEngine/product runtime APIs are sufficient for production UI.
[ ] web-ts remains read-only and dev/reference/A/B-only.
[ ] Product-core does not rely on web-ts for missing production behavior.
[ ] Common controls use ProductEvents, explicit product patches, or dirty-diff paths.
[ ] Full snapshot reloads are not used for normal live controls.
[ ] Earth texture, granular, random-walk, sample-and-hold, and reverb quality gates pass.
[ ] CPU scenario reports are fresh and pass.
[ ] Product-core native/background-audio support is either proven or explicitly deferred.
[ ] Major bloat sources are reduced or ticketed with clear ownership.
[ ] Final product-core signoff gates pass.
```

Full native/background-audio completion additionally requires:

```text
[ ] Native iOS product-core background audio passes physical-device tests.
[ ] Native macOS product-core background audio passes physical-device tests.
[ ] NativeProductRuntime renders through C++ product-core directly.
[ ] supports_native_bridge = 1 only after device evidence passes.
[ ] Browser/mobile background audio remains documented as best-effort.
```

---

## Global execution rules

```text
1. Work in large subsystem batches, not one-hook micro-slices.
2. Keep behavior-preserving refactors separate from DSP/sonic changes.
3. Do not run the full release suite after every tiny edit.
4. Run the focused validation listed for each batch.
5. Do not reintroduce web-ts as a production fallback.
6. Do not bypass ProductEnginePort/productEngine/ProductEngineProxy.
7. Do not use full snapshot reloads for normal live controls.
8. Prefer generated ProductEvents, explicit product patches, or dirty-diff paths.
9. Preserve dirty tree work that is unrelated; do not reset/stash/revert unrelated files.
10. Update `docs/product-core/product-core-self-sufficiency-ledger.md` after every batch.
```

---

## Create the self-sufficiency ledger first

Create:

```text
docs/product-core/product-core-self-sufficiency-ledger.md
```

Suggested format:

```md
# Product-Core Self-Sufficiency Ledger

## Source state

| Item | Status | Evidence |
|---|---|---|
| ProductEngineProxy is production decision point | pending | |
| ProductEnginePort is product-owned and Web Audio-free | pending | |
| web-ts is read-only A/B reference | pending | |
| production bundle excludes web-ts | pending | |
| no production import depends on web-ts | pending | |
| native bridge scope | pending | deferred / complete |

## Batch status

| Batch | Status | Validation | Notes |
|---|---|---|---|
| 1 Source truth and reference quarantine | pending | | |
| 2 Product control routing self-sufficiency | pending | | |
| 3 Sonic stability and parity gates | pending | | |
| 4 CPU evidence and optimization | pending | | |
| 5 Native/background audio evidence | pending | | |
| 6 Architecture streamlining and code-bloat reduction | pending | | |
| Final signoff | pending | | |
```

---

# Batch 1 — Source truth and reference quarantine

## Goal

Make the actual source tree, docs, ledgers, and validation scripts agree.

This batch does **not** modify web-ts. It only verifies that web-ts is quarantined for A/B reference use and that product-core production code does not depend on it.

## Scope

```text
- actual git source tree
- docs/product-core/*ledgers*
- MIGRATION_STATUS.md if present and used
- package.json scripts
- product boundary/reference/no-web-ts bundle gates
- ProductEngineProxy
- ProductAudioRuntimeSelection
- reference runtime guards
```

Do not modify:

```text
src/audio/reference/webTs/**
```

## Work

Run:

```bash
git rev-parse --short HEAD
git status --short

git ls-files src/audio/engine.ts src/audio/runtime.ts
test ! -f src/audio/engine.ts
test ! -f src/audio/runtime.ts

rg "from ['\"].*audio/engine|from ['\"].*audio/runtime|from ['\"].*coreProductEngineHost" src scripts docs -g '*.{ts,tsx,js,mjs,md}'
rg "AudioEngine|audioEngine|AudioEngineRuntimeMode|web-ts|core-smoke|reference/webTs" src scripts docs -g '*.{ts,tsx,js,mjs,md}'
```

Classify every `web-ts` or `reference/webTs` reference:

```text
allowed:
- A/B harness
- parity tests
- reference runtime
- docs explaining reference behavior
- scripts checking bundle/reference isolation

forbidden:
- production UI
- ProductEngineProxy production path
- ProductEnginePort production contract
- WebProductEngine production implementation
- product host runtime behavior
```

Patch only forbidden production dependencies.

## Validation

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:reference-isolation
npm run migration:no-web-ts-bundle
npm run migration:docs
```

## Exit criteria

```text
[ ] web-ts is untouched.
[ ] product-core production path does not import web-ts.
[ ] A/B reference path still works or is explicitly testable.
[ ] source tree and self-sufficiency ledger agree.
[ ] production bundle exclusion is proven.
```

---

# Batch 2 — Product control routing self-sufficiency

## Goal

Make product-core production controls self-sufficient without relying on web-ts behavior or legacy `updateParams` semantics.

Normal live controls should route through:

```text
ProductEvents
explicit product patches
dirty-diff paths
```

Not through:

```text
web-ts
legacy updateParams semantics
full snapshot reloads for live controls
```

## Scope

Use:

```text
docs/product-core/common-control-routing.md
src/audio/product/**
src/audio/coreProductEngineHost.ts
src/ui/**
src/App.tsx only where control wiring requires it
```

Do not modify:

```text
src/audio/reference/webTs/**
```

## Sub-batches

### 2A — Source and morph controls

```text
- source level
- source enable/mute-style toggles
- morph
- distance
- expression
- envelope controls
- source runtime modulation controls
```

### 2B — FX and routing controls

```text
- reverb controls
- delay controls
- granular controls
- FX send routing
- wet/dry/mix/depth-style controls
```

### 2C — Transport and journey controls

```text
- play/stop/start/pause/resume paths
- tempo/sync where applicable
- journey macro controls
- global macro movement
```

### 2D — Sequencer controls

```text
- step toggles
- lane sliders
- clock division
- probability/velocity/length
- evolve config
- sub-lane edits
- pitch/step overrides
- home capture/reset
```

### 2E — Structural controls

```text
- preset/session restore
- asset registration
- source topology changes
- allowed full snapshot reasons
```

## Work

For every control row:

```text
[ ] identify current product-core path
[ ] identify target product-core path
[ ] replace compatibility routing where feasible
[ ] use generated ProductEvents where available
[ ] use explicit product patches or dirty-diff paths where events are not available
[ ] document allowed structural snapshots
[ ] create ticket for any deferred path
[ ] update tests/gates
```

Allowed full snapshot reasons:

```text
- initial load
- preset load
- session restore
- deterministic fixture
- schema/ABI validation
- structural asset/source topology changes, if explicitly documented
```

Forbidden full snapshot reasons while running:

```text
- slider move
- FX send change
- sequencer step edit
- transport toggle
- mute/solo
- journey macro move
- random modulation range edit
```

## Validation

After each sub-batch:

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:web-host
```

After all sub-batches:

```bash
npm run migration:runtime-production-gates
```

## Exit criteria

```text
[ ] web-ts is untouched.
[ ] common-control-routing.md has no vague partial rows.
[ ] every control is ok / allowed structural snapshot / deferred with ticket.
[ ] routine controls avoid full snapshot reloads.
[ ] no common production control depends on web-ts.
[ ] no common production control depends on legacy updateParams semantics.
```

---

# Batch 3 — Sonic stability and parity gates

## Goal

Make product-core sonically self-sufficient while using web-ts only as read-only A/B reference.

This batch covers related sonic behavior together:

```text
- Earth sample slice repetition
- Earth/info visualizer product-core status
- granular static/click artifacts
- random-walk dual-slider runtime movement
- sample-and-hold random trigger parity
- ambient reverb smooth-tail quality
```

Do not modify:

```text
src/audio/reference/webTs/**
```

Use web-ts only to compare expected A/B behavior.

---

## 3A — Product-core debug visibility

Expose product-core telemetry for:

```text
Earth:
- active/inactive
- inactive reason
- asset id/name
- active slice count
- last offset
- slice duration
- detune
- speed
- density
- fade
- seed
- parity fixture mode

Granular:
- activeGrainCount
- droppedGrainCount
- stolenGrainCount
- reseedCount
- randomSequenceVersion
- bufferSizeFrames
- writeHead
- maxAbsOutput
- maxSampleDelta
- NaN/Inf guard count

Random walk:
- active key
- min/max
- current value
- normalized position
- last update time/frame

Sample-and-hold:
- active key
- trigger bus
- trigger counter
- last trigger time/frame
- current value

Reverb:
- mode/type
- quality / active FDN channel count
- decay
- size
- damping
- modulation
- shimmer/reverse/freeze state
- tail RMS
- CPU cost per block
- NaN/Inf/denormal guard count
```

Validation:

```bash
npm run type-check
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:web-host
npm run core:product:browser-runtime
```

---

## 3B — Earth texture anti-repeat

Fix product-core Earth texture repetition.

Investigate:

```text
[ ] product-core uses texture-slice mode
[ ] parity fixture is not accidentally enabled in production
[ ] texture params are in product snapshot
[ ] asset duration allows offset variation
[ ] seed is not reset on unrelated patches
[ ] recent-offset avoidance exists
[ ] detune/speed variation is active
```

Add tests:

```text
same asset + normal mode + 20 scheduled slices:
- at least N distinct offsets when maxOffset > threshold
- detune values are not all zero
- speed values are not all 1.0
- seed does not reset across unrelated UI patches
- parity fixture mode is deterministic and labeled
```

Validation:

```bash
npm run type-check
npm run core:product:assets
npm run core:product:source-parity
npm run core:product:determinism
npm run core:product:browser-runtime
```

---

## 3C — Granular static/click artifact gate

Upgrade product-core granular from structural checks to render-metric checks.

Investigate:

```text
[ ] effective attack/release reaching granular module
[ ] minimum envelope ramp
[ ] source send / mix / feedback smoothing
[ ] freeze toggle smoothing
[ ] buffer resize while grains are active
[ ] reverse playback buffer wrapping
[ ] reseed while grains are active
[ ] active grain stealing
[ ] NaN/Inf/denormal output
[ ] max sample-to-sample delta
```

Likely product-core fixes:

```text
[ ] enforce safe attack/release floor in samples
[ ] smooth send/mix/feedback/freeze/voice changes
[ ] make reseed safe or deferred while grains are active
[ ] fade/retire grains before buffer resize
[ ] avoid hard grain stealing
[ ] add NaN/Inf guards
```

Add or upgrade:

```bash
npm run core:product:granular-artifacts
```

Test cases:

```text
- silence through granular
- steady sine through dense granular
- impulse through granular
- reverse playback near buffer wrap
- freeze toggle
- bufferSeconds change while active
- reseed while active
- dense-grain stress
```

Validation:

```bash
npm run type-check
npm run core:product:granular-artifacts
npm run core:product:browser-runtime
npm run core:product:determinism
npm run core:product:source-parity
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
```

---

## 3D — Random-walk and sample-and-hold parity

Fix runtime modulation behavior in product-core.

Trace random-walk chain:

```text
UI range set
-> productEngine setRuntimeWalkRanges
-> product modulation range event
-> C++ range registration
-> C++ random walk advancement
-> telemetry.runtimeWalkValues
-> host runtimeWalkPositions publish
-> UI runtimeSliderState
-> DualSlider indicator movement
```

Create or update:

```text
docs/product-core/sample-hold-parity-matrix.md
```

Sample-and-hold matrix:

```text
Case 01: timed global param
Case 02: source morph
Case 03: source distance/expression
Case 04: drum morph
Case 05: drum runtime param
Case 06: Delay A trigger
Case 07: Delay B trigger
Case 08: Granular trigger
Case 09: Reverb trigger
Case 10: disabled range
Case 11: zero-width range
Case 12: reversed min/max range
Case 13: stop/resume
Case 14: deterministic fixture
Case 15: UI flash/trigger indicator
```

Validation:

```bash
npm run type-check
npm run core:product:sample-hold-parity
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:determinism
npm run core:product:source-parity
npm run core:product:browser-runtime
```

---

## 3E — Reverb smooth-tail and ambient quality

Improve and test product-core reverb for smooth ambient tails.

Target sound direction:

```text
- smooth ambient tails
- Supermassive-style large spaces / slow bloom / echo clouds
- Blackhole-style wash / gravity / freeze / infinite-like behavior
- no clicks on mode or quality changes
- no denormal/NaN/Inf runaway
- mobile-safe CPU profile
```

Do not clone proprietary algorithms. Build Kessho-native modes using product-core reverb.

Add or upgrade:

```bash
npm run core:product:reverb-tail-quality
```

Test cases:

```text
- long impulse tail
- smooth decay envelope
- mode transition while tail is active
- quality transition while tail is active
- freeze engage/disengage
- infinite/hold behavior if implemented
- shimmer/reverse tail
- low-frequency buildup guard
- denormal guard
- CPU per quality mode
```

CPU-safe improvements:

```text
[ ] smooth live controls
[ ] crossfade structural changes
[ ] curated ambient modes with safe ranges
[ ] Ultra/Balanced/Lite quality policy
[ ] mobile default profile
[ ] CPU governor downgrade path
[ ] no abrupt quality switch without crossfade
```

Validation:

```bash
npm run type-check
npm run core:product:reverb-tail-quality
npm run core:product:browser-runtime
npm run core:product:cpu
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
```

---

## Batch 3 final validation

```bash
npm run type-check
npm run core:product:granular-artifacts
npm run core:product:sample-hold-parity
npm run core:product:reverb-tail-quality
npm run core:product:browser-runtime
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run migration:runtime-production-gates
```

## Exit criteria

```text
[ ] web-ts is untouched.
[ ] product-core Earth texture slices vary in normal mode.
[ ] product-core Earth/debug visualizer shows status.
[ ] product-core granular artifact tests pass.
[ ] product-core random-walk dual sliders move from runtime telemetry.
[ ] product-core sample-and-hold matrix passes or documents intentional differences.
[ ] product-core reverb smooth-tail tests pass.
[ ] A/B comparison remains possible through read-only web-ts.
```

---

# Batch 4 — CPU evidence and optimization

## Goal

Make product-core CPU behavior measurable, fresh, scenario-specific, and actionable.

Do not use web-ts as production fallback. web-ts may be used only for A/B CPU comparison.

## Scope

```text
- CPU reports
- scenario-specific CPU profiling
- module-level CPU telemetry
- mobile browser CPU profile
- CPU governor
- native render CPU profile once native path is tested
- shared gate/test utilities
```

## Work

Publish or generate fresh reports:

```text
docs/reports/kessho-product-cpu-budget-latest.json
docs/reports/kessho-product-cpu-budget-latest.md
docs/reports/kessho-product-web-cpu-comparison-latest.json
docs/reports/kessho-product-page-cpu-comparison-latest.json
```

Scenario profiles:

```text
Scenario 01: default product scene
Scenario 02: Earth texture scene
Scenario 03: dense granular scene
Scenario 04: long ambient reverb scene
Scenario 05: spectral freeze scene
Scenario 06: random-walk + sample-hold modulation scene
Scenario 07: mobile browser foreground
Scenario 08: browser hidden/resume best-effort
Scenario 09: native iOS render, when available
Scenario 10: native macOS render, when available
```

Per-module CPU telemetry targets:

```text
sources
soundscapes/Earth
granular
reverb
delay
spectral freeze
dynamics
visual telemetry
asset decode/register
worklet messaging
UI telemetry subscriptions
native render callback
```

CPU governor targets:

```text
Desktop:
- Ultra allowed when headroom exists
- full visual telemetry allowed

Mobile browser:
- Balanced default
- Lite under pressure
- lower visual telemetry rate under pressure
- reduce granular/reverb quality before callback misses

Native background:
- conservative background profile
- stable render callback budget
- no realtime allocations
```

## Shared gate harness streamlining

Create shared helpers if they do not exist:

```text
scripts/product-core/lib/reporting.mjs
scripts/product-core/lib/freshness.mjs
scripts/product-core/lib/packageScripts.mjs
scripts/product-core/lib/sourceTokens.mjs
scripts/product-core/lib/audioMetrics.mjs
scripts/product-core/lib/cpuReports.mjs
```

Use shared helpers across:

```text
CPU scenarios
granular artifacts
reverb tail quality
background audio
native capability signoff
docs freshness
runtime production gates
```

Do not combine all gates into one giant script. Keep separate gate entry points and share internals.

## Validation

```bash
npm run type-check
npm run core:product:cpu
npm run core:product:web-cpu-comparison
npm run core:product:page-cpu-comparison
npm run core:product:cpu-scenarios
npm run test:mobile-web-hotpaths
npm run core:product:browser-runtime
```

## Exit criteria

```text
[ ] web-ts is untouched except read-only A/B CPU comparison.
[ ] CPU reports are fresh and inspectable.
[ ] scenario-specific CPU profiles exist.
[ ] heavy sonic paths are measured.
[ ] mobile browser budget is explicit.
[ ] CPU governor policy is implemented or clearly ticketed.
[ ] shared gate helpers reduce script boilerplate without weakening gates.
```

---

# Batch 5 — Native and background audio evidence

## Goal

Make native/background audio product-core-based and evidence-driven.

Browser/mobile background audio is best-effort. Reliable iOS/macOS background audio requires native product-core rendering.

Do not use web-ts to solve background audio.

## Scope

```text
- native iOS product-core render path
- native macOS product-core render path
- AVAudioSession / background audio
- Now Playing / remote commands
- route changes
- interruption handling
- browser/mobile best-effort behavior
- device evidence ledger
```

Do not modify:

```text
src/audio/reference/webTs/**
```

## Browser/mobile best-effort

```text
[ ] Media Session metadata/actions
[ ] Page Visibility diagnostics
[ ] Page Lifecycle diagnostics where supported
[ ] AudioContext interruption/suspend/resume handling
[ ] optional Wake Lock while page is visible
[ ] visible user status for foreground/hidden/suspended/resumed
[ ] docs clearly say mobile browser background audio is best-effort
```

## Native iOS/macOS

```text
[ ] native build target passes
[ ] native product-core library/framework builds
[ ] NativeProductEngine wrapper works
[ ] native render callback calls product-core directly
[ ] no JS/Capacitor bridge in render callback
[ ] lock-free event queue works
[ ] telemetry double buffer works
[ ] asset registration works off audio thread
[ ] route changes handled
[ ] interruptions handled
[ ] Now Playing / remote commands work
```

## Physical-device evidence

Use:

```text
docs/product-core/background-audio-device-evidence.md
```

Required rows:

```text
iOS:
[ ] foreground playback
[ ] screen lock
[ ] app background
[ ] Control Center play/pause
[ ] AirPods/Bluetooth route change
[ ] interruption recovery

macOS:
[ ] app hidden/minimized
[ ] sleep/wake recovery
[ ] audio device change
[ ] media keys if supported
```

## Validation

```bash
npm run type-check
npm run core:product:background-audio
npm run core:product:native-render-path
npm run core:product:native-background-smoke
npm run core:product:native-capability-signoff
npm run migration:docs
```

## Native capability rule

```text
supports_native_bridge must remain 0 until every required native evidence row passes.
```

Only after physical-device evidence passes:

```text
[ ] set supports_native_bridge = 1
[ ] expose native-product only on supported platforms/builds
[ ] update native docs from deferred to supported
```

## Exit criteria

```text
[ ] web-ts is untouched.
[ ] browser/mobile best-effort behavior is implemented and honestly documented.
[ ] native render path uses product-core directly.
[ ] iOS/macOS device evidence is recorded.
[ ] native capability remains disabled until proof passes.
[ ] no realtime audio buffers cross JS/Capacitor bridge.
```

---

# Batch 6 — Architecture streamlining and code-bloat reduction

## Goal

Reduce product-core code bloat and transitional glue without touching web-ts.

This batch should run after behavior and CPU evidence are stable, unless a cleanup is required to unblock earlier batches.

## Do not modify

```text
src/audio/reference/webTs/**
```

---

## 6A — Capability-port compression

Current problem:

```text
ProductEnginePort is product-shaped but too broad.
Many one-off methods/callbacks create mirrored boilerplate in WebProductEngine and host code.
```

Target:

```text
ProductEnginePort becomes capability-based.
```

Possible split:

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

Replace one-off callback setters with typed subscriptions where feasible:

```ts
productEngine.telemetry.subscribe(topic, callback)
productEngine.controls.dispatch(command)
productEngine.events.enqueue(event)
productEngine.modulation.subscribe(topic, callback)
```

Validation:

```bash
npm run type-check
npm run core:product:architecture
npm run core:product:web-host
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
```

---

## 6B — WebProductEngine adapter compression

Target:

```text
WebProductEngine is a thin platform adapter.
```

Remove or narrow:

```text
legacy-adapter-update
updateParamsWithReason for normal controls
temporary sequencer UI bridges, where replaced
broad unknown payloads
raw Web Audio/browser type leaks
mirror-method boilerplate replaced by capability surfaces
```

Validation:

```bash
npm run type-check
npm run core:product:architecture
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:web-host
```

---

## 6C — Host orchestration cleanup

Target:

```text
coreProductEngineHost.ts becomes lifecycle/orchestration only.
```

Move remaining responsibilities to focused modules:

```text
ProductRuntimeCallbackRegistry
CoreProductSnapshotService
CoreProductTelemetryService
CoreProductDiagnosticsService
CoreProductAssetService
CoreProductSequencerBridge
CoreProductModulationBridge
CoreProductVisualTelemetryService
CoreProductRuntimeControlRouter
```

Validation:

```bash
npm run type-check
npm run core:product:host-reconciliation
npm run core:product:dirty-diff
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:web-host
```

---

## 6D — App shell extraction

Target:

```text
App.tsx becomes route/layout composition and top-level orchestration only.
```

Extract:

```text
product diagnostics panel
media/background audio controller
preset/session sync
runtime UI/switch surfaces
product feature surfaces
telemetry subscriptions
modulation UI state
Earth surface container
Sequencer surface container
FX surface container
```

Validation:

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:architecture
npm run core:product:web-host
npm run core:product:browser-runtime
```

---

## 6E — Generated metadata and type cleanup

Target:

```text
Product public types are product-owned or generated.
```

Work:

```text
[ ] replace broad Record<string, unknown> patches with generated patch/event unions where feasible
[ ] generate callback topic names
[ ] generate control param metadata
[ ] generate event builders
[ ] generate UI control-to-event mapping
[ ] reduce duplicate enum/string maps
[ ] reduce mismatched UI/backend keys
```

Check:

```bash
rg "EngineState|AudioEngine|AudioNode|GainNode|AnalyserNode|MediaStream|unknown|Record<string, unknown>" src/audio/product src/ui src/App.tsx -g '*.{ts,tsx}'
```

Validation:

```bash
npm run type-check
npm run core:product:schema
npm run core:product:param-accounting
npm run core:product:patch-bridges
npm run core:product:source-parity
```

---

## 6F — Shared test/gate harness cleanup

Target:

```text
Separate gate entry points, shared internals.
```

Create or consolidate:

```text
scripts/product-core/lib/reporting.mjs
scripts/product-core/lib/freshness.mjs
scripts/product-core/lib/packageScripts.mjs
scripts/product-core/lib/sourceTokens.mjs
scripts/product-core/lib/audioMetrics.mjs
scripts/product-core/lib/cpuReports.mjs
scripts/product-core/lib/deviceEvidence.mjs
```

Apply shared helpers to:

```text
core:product:cpu-scenarios
core:product:granular-artifacts
core:product:reverb-tail-quality
core:product:background-audio
core:product:native-capability-signoff
migration:docs
migration:runtime-production-gates
```

Validation:

```bash
npm run core:product:cpu-scenarios
npm run core:product:granular-artifacts
npm run core:product:reverb-tail-quality
npm run core:product:background-audio
npm run core:product:native-capability-signoff
npm run migration:docs
```

## Batch 6 exit criteria

```text
[ ] web-ts is untouched.
[ ] ProductEnginePort is capability-oriented or has a documented migration path.
[ ] WebProductEngine is a thin adapter.
[ ] coreProductEngineHost is smaller and focused on orchestration.
[ ] App.tsx has major feature/runtime surfaces extracted.
[ ] product public types are product-owned/generated where feasible.
[ ] script boilerplate is reduced through shared helpers.
[ ] all refactor validations pass.
```

---

# Final signoff

Run after Batches 1–6.

## Web-default product-core signoff

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:architecture
npm run core:product:reference-isolation
npm run migration:no-web-ts-bundle
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:dirty-diff
npm run core:product:patch-bridges
npm run core:product:snapshot-authority
npm run core:product:web-host
npm run core:product:browser-runtime
npm run core:product:cpu
npm run core:product:cpu-scenarios
npm run core:product:granular-artifacts
npm run core:product:sample-hold-parity
npm run core:product:reverb-tail-quality
npm run migration:runtime-production-gates
npm run migration:docs
npm run core:product:ci
```

## Source signoff

```bash
test ! -f src/audio/engine.ts
test ! -f src/audio/runtime.ts

rg "from ['\"].*audio/engine|from ['\"].*audio/runtime|from ['\"].*coreProductEngineHost" src -g '*.{ts,tsx}'
rg "legacy-adapter-update|updateParamsWithReason|AudioNode|GainNode|AnalyserNode|MediaStream|EngineState" src/audio/product src/ui src/App.tsx -g '*.{ts,tsx}'
```

Allowed leftovers:

```text
reference/dev harnesses
A/B tests
scripts
docs explaining history
explicitly ticketed compatibility paths outside common production controls
```

## Native/background signoff

If native is deferred:

```text
[ ] docs clearly say native reliable background audio is deferred
[ ] native-product is not exposed as production
[ ] supports_native_bridge remains 0
```

If native is complete:

```text
[ ] physical-device evidence passes
[ ] native capability signoff passes
[ ] supports_native_bridge = 1
[ ] native-product exposed only on supported builds
```

---

# Parallel execution plan for multiple agents

## Safe parallelism rule

Parallel work is allowed only when agents do not edit the same ownership area.

All agents must treat this as read-only:

```text
src/audio/reference/webTs/**
```

---

## Agent A — Source truth and boundary owner

Primary batch:

```text
Batch 1
```

Owns:

```text
product boundary scripts
reference-isolation scripts
no-web-ts bundle gate
self-sufficiency ledger
runtime selection docs
ProductEngineProxy validation
```

Should not edit:

```text
sonic DSP
native render
App feature extraction
web-ts
```

Can run immediately.

---

## Agent B — Control routing owner

Primary batch:

```text
Batch 2
```

Owns:

```text
common-control-routing.md
ProductEvents / product patches / dirty-diff routing
source/morph/FX/transport/sequencer control paths
WebProductEngine compatibility TODO burn-down related to controls
```

Should coordinate with:

```text
Agent F on ProductEnginePort shape
Agent C on modulation/sample-hold paths
```

Can start after Agent A confirms web-ts quarantine.

---

## Agent C — Sonic behavior owner

Primary batch:

```text
Batch 3
```

Can split into sub-agents:

```text
C1 Earth texture and visualizer
C2 Granular artifact gate
C3 Random-walk/sample-hold parity
C4 Reverb smooth-tail quality
```

Owns:

```text
product-core sonic telemetry
offline/render metric tests
browser/runtime sonic interaction gates
product-core DSP/host fixes where required
```

Can read web-ts for A/B comparison only.

Should coordinate with:

```text
Agent D for CPU measurements
Agent B for control routing
```

Can start after Agent A confirms source truth. C1/C2/C3/C4 can work in parallel if they avoid editing the same files.

---

## Agent D — CPU and gate infrastructure owner

Primary batch:

```text
Batch 4
```

Owns:

```text
CPU reports
CPU scenario gate
per-module CPU telemetry
CPU governor policy
shared gate/test harness helpers
report freshness helpers
audio metrics helpers
```

Should coordinate with:

```text
Agent C for granular/reverb/Earth CPU metrics
Agent E for native render CPU
```

Can start in parallel with Agent C after Agent A confirms source truth.

---

## Agent E — Native/background owner

Primary batch:

```text
Batch 5
```

Owns:

```text
background-audio docs
device evidence ledger
native render path
native capability signoff
iOS/macOS physical tests
browser/mobile best-effort behavior
```

Should coordinate with:

```text
Agent D for native CPU metrics
Agent F if ProductEnginePort/capability surfaces change native wrapper contracts
```

Can start with docs/evidence setup after Agent A. Native implementation should wait if Agent F is actively changing public product engine contracts.

---

## Agent F — Architecture streamlining owner

Primary batch:

```text
Batch 6
```

Owns:

```text
ProductEnginePort capability split
WebProductEngine adapter compression
coreProductEngineHost orchestration cleanup
App.tsx feature extraction
generated metadata/type cleanup
script harness cleanup if not owned by Agent D
```

Should not begin broad refactors until:

```text
Agent B has stabilized major control routes
Agent C has added sonic behavior gates
```

Can safely start with non-invasive planning and small extraction prep after Agent A.

---

## Recommended parallel schedule

```text
Stage 1:
- Agent A runs Batch 1.
- Other agents inspect only, no broad edits.

Stage 2:
- Agent B starts Batch 2.
- Agent C starts Batch 3 telemetry/test scaffolding.
- Agent D starts Batch 4 report/gate harness work.
- Agent E starts Batch 5 docs/evidence preparation.

Stage 3:
- Agent C implements sonic fixes.
- Agent D wires CPU metrics to sonic scenarios.
- Agent E runs native/background device checks where available.

Stage 4:
- Agent F runs Batch 6 architecture cleanup after control/sonic contracts stabilize.

Stage 5:
- One agent runs final signoff.
```

---

## Required report after every batch

Use exactly this format:

```text
Batch:
- <batch number and name>

Agent:
- <agent name/id>

Changed files:
- ...

Existing dirty files modified:
- file: why it was safe/necessary

web-ts touched:
- no
- if yes, stop and explain why before proceeding

Behavior changes:
- none
- or explicit list

Validation run:
- command: pass/fail
- command: pass/fail

Manual/device tests:
- test: pass/fail/not run, with reason

Validation intentionally skipped:
- command: reason

Batch exit criteria:
- complete/incomplete
- remaining blockers if incomplete

Remaining product-core self-sufficiency blockers:
- ...

Parallel coordination notes:
- files/areas other agents should avoid
- dependencies resolved or pending

Next batch:
- ...
```

---

## Immediate next action

Start with:

```text
Batch 1 — Source truth and reference quarantine
```

Then run in parallel:

```text
Agent B: Batch 2 control routing
Agent C: Batch 3 sonic gates
Agent D: Batch 4 CPU evidence
Agent E: Batch 5 background evidence prep
```

Hold broad architecture cleanup until product-core behavior and contracts are stable.

