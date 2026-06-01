# Product-Core Production Evidence and Cleanup Batch Plan

## Purpose

This plan is for the next phase after the web-default `web-ts` → `product-core` migration was reported complete.

The goal is **not to chase tiny fixes one by one**. The goal is to run a small number of related, testable batches that improve the quality, evidence, CPU profile, and production readiness of the product-core port.

The plan assumes `product-core` is intended to be the production runtime, while `web-ts` is dev/reference/parity-only.

---

## Current working assumption

The migration may be structurally complete, but it still needs a **production evidence pass**.

Known risk areas:

```text
1. Source-of-truth mismatch between ledger/docs and actual source tree.
2. Common control routing still has partial/product-patch compatibility paths.
3. Sonic production gates are missing or incomplete for Earth, granular, reverb, random walk, and sample-and-hold.
4. CPU gates exist, but scene-specific CPU evidence is not deep enough.
5. Native/background audio has architecture work, but physical-device evidence is still required.
6. Host/App/WebProductEngine architecture is acceptable for migration but still carries tech debt.
7. Status docs may disagree with the actual completed state.
```

---

## Execution rules

Follow these rules for every batch:

```text
1. Work in large subsystem batches, not one-hook micro-slices.
2. Do not run the full release suite after every tiny edit.
3. Run the focused validation listed for each batch.
4. Keep behavior-preserving refactors separate from DSP/sonic changes.
5. Do not reintroduce web-ts as a production fallback.
6. Do not bypass ProductEnginePort/productEngine/ProductEngineProxy.
7. Do not use full snapshot reloads for normal live controls.
8. Use ProductEvents, explicit product patches, or dirty-diff paths for live controls.
9. Browser/mobile background audio is best-effort only.
10. Reliable iOS/macOS background audio requires native product-core rendering.
11. Update docs/product-core/product-core-production-evidence-ledger.md after each batch.
```

---

## Create the evidence ledger first

Create:

```text
docs/product-core/product-core-production-evidence-ledger.md
```

Suggested format:

```md
# Product-Core Production Evidence Ledger

## Current source state

| Item | Status | Evidence |
|---|---|---|
| src/audio/engine.ts absent | pending | |
| src/audio/runtime.ts absent | pending | |
| ProductEngineProxy is production decision point | pending | |
| web-ts reference-only | pending | |
| migration:no-web-ts-bundle passes | pending | |
| native bridge scope | pending | deferred / implemented |

## Batch status

| Batch | Status | Validation | Notes |
|---|---|---|---|
| 0 Source-of-truth reconciliation | pending | | |
| 1 Control-routing cleanup | pending | | |
| 2 Sonic stability and parity gates | pending | | |
| 3 CPU evidence and optimization | pending | | |
| 4 Native/background audio evidence | pending | | |
| 5 Architecture debt cleanup | pending | | |
| 6 Final production signoff | pending | | |
```

---

# Batch 0 — Source-of-truth reconciliation

## Goal

Make the actual source tree, migration ledger, status docs, and validation scripts agree.

This batch is required before trusting any “migration complete” claim.

## Scope

```text
- actual git source tree
- docs/product-core/migration-batch-ledger.md
- MIGRATION_STATUS.md
- docs/product-core/product-core-production-blocker-plan.md
- package.json scripts
- product boundary/reference/no-web-ts bundle gates
```

Do not touch DSP, runtime behavior, native render code, or UI feature code unless needed to fix stale imports.

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

Then reconcile:

```text
[ ] If src/audio/engine.ts exists, move/delete it or classify it as a failing blocker.
[ ] If src/audio/runtime.ts exists, delete it or make it explicitly dev/reference-only.
[ ] Ensure product boundary script matches actual intended policy.
[ ] Ensure reference-isolation and no-web-ts-bundle scripts reflect actual production rules.
[ ] Update migration-batch-ledger.md if it is stale.
[ ] Update MIGRATION_STATUS.md if it contradicts the ledger.
[ ] Update product-core-production-blocker-plan.md if its final checkboxes are stale.
```

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
[ ] source tree and ledger agree
[ ] root legacy runtime/engine status is proven
[ ] product/reference runtime status is proven
[ ] docs do not contradict local validation
[ ] production bundle exclusion is proven
```

---

# Batch 1 — Common control routing cleanup

## Goal

Close the remaining partial control-routing debt in one or more subsystem batches.

The target is:

```text
Normal live controls
-> ProductEvents, explicit product patches, or dirty-diff paths

Not:
-> legacy updateParams semantics
-> full snapshot reloads
```

## Scope

Use the current routing doc as the checklist:

```text
docs/product-core/common-control-routing.md
```

Group work by subsystem instead of tiny components.

### Sub-batch 1A — Source and morph controls

```text
- source level
- mute/solo or enable toggles
- morph
- distance
- expression
- envelope controls
- source runtime modulation controls
```

### Sub-batch 1B — FX and routing controls

```text
- reverb mix/depth/size/decay-style controls
- delay send/mix/feedback controls
- granular send/mix/freeze-related controls
- FX send routing
```

### Sub-batch 1C — Transport and journey controls

```text
- start/stop/play/pause
- tempo/sync if applicable
- journey macro controls
- global macro movement
```

### Sub-batch 1D — Sequencer controls

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

### Sub-batch 1E — Structural controls

```text
- preset/session restore
- asset/source structure changes
- allowed full snapshot reasons
```

Structural changes may still use full snapshot reloads if explicitly allowed and documented.

## Work

For every row in `common-control-routing.md`:

```text
[ ] classify current path
[ ] classify target path
[ ] implement event/patch/dirty-diff route where feasible
[ ] mark allowed full snapshots explicitly
[ ] add TODO/ticket for any deferred path
[ ] update tests/gates so regressions are caught
```

Allowed full snapshot reasons:

```text
- initial load
- preset load
- session restore
- deterministic test fixture
- schema/ABI validation
- structural asset/source topology changes, if explicitly documented
```

Forbidden full snapshot reasons while running:

```text
- normal slider move
- FX send change
- sequencer step edit
- transport toggle
- mute/solo
- journey macro move
- random modulation range edit
```

## Validation

Run after each sub-batch:

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:web-host
```

Run after all Batch 1 sub-batches:

```bash
npm run migration:runtime-production-gates
```

## Exit criteria

```text
[ ] common-control-routing.md has no vague "partial" rows
[ ] every row is ok / allowed structural snapshot / deferred with ticket
[ ] routine controls avoid full snapshot reloads
[ ] no legacy updateParams semantics remain for common production controls
[ ] runtime production gates pass
```

---

# Batch 2 — Sonic stability and parity gates

## Goal

Add production-quality sonic gates for the bugs and sound-quality risks that generic migration gates do not catch.

This batch covers related sonic stability issues together:

```text
- Earth sample slice repetition
- granular static/click artifacts
- random-walk dual slider runtime movement
- sample-and-hold trigger parity
- ambient reverb smooth-tail quality
```

Do not split these into unrelated micro-fixes. Add shared telemetry, offline tests, and product-runtime interaction gates.

---

## Sub-batch 2A — Product-core debug visibility

Expose enough telemetry to diagnose sonic state.

Required debug surfaces:

```text
Earth texture:
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

## Sub-batch 2B — Earth texture anti-repeat

Fix and test Earth texture repetition.

Investigation:

```text
[ ] product-core is actually using texture-slice mode
[ ] soundscapeParityFixture is not accidentally enabled
[ ] texture params are present in the product snapshot
[ ] asset duration allows offset variation
[ ] seed is not reset on unrelated UI patches
[ ] recent-offset avoidance exists or is added
[ ] detune/speed variation is active
```

Tests:

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

## Sub-batch 2C — Granular static/click artifact gate

Fix short static artifacts in product-core granular that do not exist in reference behavior.

Investigate:

```text
[ ] effective attack/release reaching granular module
[ ] missing minimum envelope ramp
[ ] source send / mix / feedback smoothing
[ ] freeze toggle smoothing
[ ] buffer resize while grains are active
[ ] reverse playback buffer wrapping
[ ] reseed while grains are active
[ ] active grain stealing
[ ] NaN/Inf/denormal output
[ ] max sample-to-sample delta
```

Likely fixes:

```text
[ ] enforce safe attack/release floor in samples
[ ] smooth send/mix/feedback/freeze/voice changes
[ ] make reseed safe or deferred while grains are active
[ ] fade/retire grains before buffer resize
[ ] avoid hard grain stealing
[ ] add NaN/Inf guards
```

Add script:

```json
{
  "scripts": {
    "core:product:granular-artifacts": "node scripts/check-kessho-product-granular-artifacts.mjs"
  }
}
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

## Sub-batch 2D — Random-walk and sample-and-hold parity

Fix runtime modulation behavior as one related modulation batch.

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

Add or update:

```text
docs/product-core/sample-hold-parity-matrix.md
```

Validation:

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:determinism
npm run core:product:source-parity
npm run core:product:browser-runtime
```

Add if missing:

```json
{
  "scripts": {
    "core:product:sample-hold-parity": "node scripts/check-kessho-product-sample-hold-parity.mjs"
  }
}
```

---

## Sub-batch 2E — Reverb smooth-tail and CPU-safe ambient quality

Improve and test reverb for smooth ambient tails while keeping CPU stable.

Target sound direction:

```text
- smooth ambient tails
- Supermassive-style large spaces / slow bloom / echo clouds
- Blackhole-style wash / gravity / freeze / infinite-like behavior
- no clicks on mode or quality changes
- no denormal/NaN/Inf runaway
- mobile-safe CPU profile
```

Do not clone proprietary algorithms. Build Kessho-native modes using the current product-core reverb.

Add telemetry:

```text
- mode/type
- quality
- active FDN channel count
- decay
- size
- feedback gain
- predelay/bloom delay
- diffusion
- damping
- modulation
- shimmer/reverse/freeze/infinite state
- input/output peak
- tail RMS
- estimated decay time
- CPU per block
- denormal/NaN/Inf guard count
- transition crossfade status
```

Add script:

```json
{
  "scripts": {
    "core:product:reverb-tail-quality": "node scripts/check-kessho-product-reverb-tail-quality.mjs"
  }
}
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

## Batch 2 final validation

After all sonic sub-batches:

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

## Batch 2 exit criteria

```text
[ ] Earth texture slices vary in normal mode
[ ] Earth debug status is visible in product-core
[ ] granular static/click artifacts are covered by tests
[ ] random-walk dual sliders move from runtime telemetry
[ ] sample-and-hold matrix is complete
[ ] reverb has smooth-tail quality tests
[ ] sonic tests are part of product-core gates
```

---

# Batch 3 — CPU evidence and optimization

## Goal

Move from generic CPU pass/fail to actionable scene-specific performance evidence.

CPU work should happen after major sonic behavior is instrumented, because granular/reverb/Earth/random modulation are likely CPU hotspots.

## Scope

```text
- CPU reports
- scenario-specific CPU profiling
- module-level CPU telemetry
- mobile browser CPU profile
- native render CPU profile once native path exists
- adaptive quality/governor work
```

## Work

Add or publish latest reports:

```text
docs/reports/kessho-product-cpu-budget-latest.json
docs/reports/kessho-product-cpu-budget-latest.md
docs/reports/kessho-product-web-cpu-comparison-latest.json
docs/reports/kessho-product-page-cpu-comparison-latest.json
```

Add scenario profiles:

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

Add per-module CPU telemetry if missing:

```text
sources
soundscapes
granular
reverb
delay
dynamics
visual telemetry
asset decode/register
worklet messaging
UI telemetry subscription cost
```

CPU governor targets:

```text
Desktop:
- Ultra allowed when headroom exists
- full visual telemetry allowed

Mobile browser:
- Balanced default
- Lite under pressure
- shimmer/reverb/granular heavy modes limited
- lower visual telemetry rate if needed

Native background:
- conservative background profile
- stable render callback budget
- no realtime allocations
```

## Validation

```bash
npm run type-check
npm run core:product:cpu
npm run core:product:web-cpu-comparison
npm run core:product:page-cpu-comparison
npm run test:mobile-web-hotpaths
npm run core:product:browser-runtime
```

Add if missing:

```json
{
  "scripts": {
    "core:product:cpu-scenarios": "node scripts/check-kessho-product-cpu-scenarios.mjs"
  }
}
```

Then run:

```bash
npm run core:product:cpu-scenarios
```

## Exit criteria

```text
[ ] CPU reports are generated and inspectable
[ ] scene-specific CPU profiles exist
[ ] heavy sonic paths are measured
[ ] mobile browser budget is explicit
[ ] adaptive quality/governor policy exists
[ ] no CPU spike regressions from sonic fixes
```

---

# Batch 4 — Native and background audio evidence

## Goal

Turn native/background audio from architecture and preflight into verified product capability.

Do not mark native bridge complete until device evidence exists.

## Scope

```text
- native iOS product-core render path
- native macOS product-core render path
- AVAudioSession / background audio
- Now Playing / remote commands
- route changes
- interruption handling
- browser/mobile best-effort docs and behavior
- device evidence ledger
```

## Work

Use:

```text
docs/product-core/background-audio.md
docs/product-core/background-audio-test-matrix.md
docs/product-core/background-audio-device-evidence.md
```

Browser/mobile best-effort:

```text
[ ] Media Session metadata/actions
[ ] Page Visibility diagnostics
[ ] Page Lifecycle diagnostics where supported
[ ] AudioContext interruption/suspend/resume handling
[ ] optional Wake Lock while page is visible
[ ] visible user status for foreground/hidden/suspended/resumed
[ ] docs clearly say mobile browser background audio is best-effort
```

Native iOS/macOS:

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

Physical-device evidence:

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

Native capability rule:

```text
supports_native_bridge must remain 0 until every required native evidence row passes.
```

Only after device proof:

```text
[ ] set supports_native_bridge = 1
[ ] expose native-product only on supported platforms/builds
[ ] update native docs from deferred to supported
```

## Exit criteria

```text
[ ] browser/mobile best-effort behavior is implemented and honestly documented
[ ] native render path passes smoke tests
[ ] iOS/macOS device evidence is recorded
[ ] supports_native_bridge remains 0 until evidence passes
[ ] native capability signoff passes before native-product is exposed
```

---

# Batch 5 — Architecture debt cleanup

## Goal

Reduce remaining tech debt after production behavior and CPU evidence are stable.

This batch should not happen before the sonic and CPU batches unless a refactor is required for them.

## Scope

```text
- coreProductEngineHost.ts
- WebProductEngine
- ProductEnginePort/ProductEngineTypes
- App.tsx
- selected-audio-engine compatibility naming
- generated/schema type ownership
```

## Sub-batch 5A — Host split

Target:

```text
coreProductEngineHost.ts becomes lifecycle/orchestration only.
```

Move remaining responsibilities to focused modules:

```text
diagnostics
unsupported policy
snapshot coordination
patch classification
asset registration
telemetry adapter
sequencer UI adapter
harmony bridge
arrangement bridge
recording/stem bridge
graph tap bridge
modulation range bridge
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

## Sub-batch 5B — WebProductEngine closure

Target:

```text
WebProductEngine is a thin platform adapter, not a compatibility architecture.
```

Remove or narrow:

```text
legacy-adapter-update
updateParamsWithReason for normal controls
temporary sequencer UI bridges
broad unknown payloads
raw Web Audio / browser type leaks
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

## Sub-batch 5C — App.tsx decomposition

Target:

```text
App.tsx becomes route/layout composition and top-level orchestration only.
```

Extract:

```text
product diagnostics panel
preset/session orchestration
media/background audio integration
runtime UI
feature surfaces
telemetry subscriptions
modulation UI state
```

Validation:

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:architecture
npm run core:product:web-host
```

---

## Sub-batch 5D — Type/schema hardening

Target:

```text
Product public types are product-owned or generated.
```

Check:

```bash
rg "EngineState|AudioEngine|AudioNode|GainNode|AnalyserNode|MediaStream|unknown|Record<string, unknown>" src/audio/product src/ui src/App.tsx -g '*.{ts,tsx}'
```

Patch:

```text
[ ] no legacy EngineState aliases in product public types
[ ] no raw Web Audio/browser-only objects in ProductEnginePort
[ ] generated schema/event/param types are used where available
[ ] broad unknown payloads are reduced or ticketed
```

Validation:

```bash
npm run type-check
npm run core:product:schema
npm run core:product:param-accounting
npm run core:product:patch-bridges
npm run core:product:source-parity
```

## Batch 5 exit criteria

```text
[ ] host is small and focused
[ ] WebProductEngine is a thin adapter
[ ] App.tsx is no longer a monolith
[ ] product public types are product-owned/generated
[ ] compatibility naming remains only in explicitly ticketed modules
```

---

# Batch 6 — Final production signoff

## Goal

Prove product-core is production-ready for the web-default target, and separately prove or defer native/background capability.

## Run full web-default gate suite

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
npm run core:product:granular-artifacts
npm run core:product:sample-hold-parity
npm run core:product:reverb-tail-quality
npm run core:product:cpu-scenarios
npm run migration:runtime-production-gates
npm run migration:docs
npm run core:product:ci
```

If any optional scripts do not exist yet, create them in earlier batches or document why they are deferred.

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
tests/scripts
docs explaining history
explicitly ticketed compatibility paths outside common production controls
```

## Native/background signoff

If native is still deferred:

```text
[ ] docs clearly say native reliable background audio is deferred
[ ] native-product is not exposed as production
[ ] supports_native_bridge remains 0
```

If native is complete:

```text
[ ] device evidence passes
[ ] native capability signoff passes
[ ] supports_native_bridge = 1
[ ] native-product exposed only on supported builds
```

## Exit criteria

```text
[ ] all required web-default gates pass
[ ] sonic gates pass
[ ] CPU scenario reports pass
[ ] runtime production gates pass
[ ] source signoff passes
[ ] docs/status/evidence ledgers agree
[ ] native is either proven or explicitly deferred
```

---

# Final completion definitions

## Web-default product-core production-ready

This is complete when:

```text
[ ] product-core is the only production web runtime
[ ] web-ts is reference/parity-only and absent from production bundle
[ ] routine controls avoid legacy updateParams/full snapshot paths
[ ] Earth, granular, random-walk, sample-hold, and reverb gates pass
[ ] CPU scenario reports pass
[ ] fallback/unsupported counters are zero
[ ] docs/status/evidence ledgers agree
[ ] native is explicitly deferred if not complete
```

## Full product-core production-ready, including background audio

This is complete when all web-default criteria pass plus:

```text
[ ] native iOS product-core background audio passes device tests
[ ] native macOS product-core background audio passes device tests
[ ] NativeProductRuntime renders through C++ product-core directly
[ ] supports_native_bridge = 1
[ ] native-product is exposed only on supported builds
[ ] mobile browser background audio remains documented as best-effort
```

---

# Required report after every batch

Use exactly this format:

```text
Batch:
- <batch number and name>

Changed files:
- ...

Existing dirty files modified:
- file: why it was safe/necessary

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

Remaining production blockers:
- ...

Next batch:
- ...
```

---

# Recommended immediate order

```text
0. Source-of-truth reconciliation
1. Common control routing cleanup
2. Sonic stability and parity gates
3. CPU evidence and optimization
4. Native and background audio evidence
5. Architecture debt cleanup
6. Final production signoff
```

Do not start with App.tsx or host cleanup unless it blocks the earlier production evidence batches. The highest-value next work is to prove the current product-core path, close control-routing partials, add sonic gates, and produce CPU/background evidence.
