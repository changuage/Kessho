# Kessho Product-Core Production Blocker Plan

## Purpose

This file is an execution plan after the web-default `web-ts` → `product-core` migration was reported complete through the previous Batch 13.

The next goal is **not generic migration cleanup**. The next goal is to make `product-core` production-quality for the bugs currently observed:

1. Earth sample slices repeat the same region with little or no audible variation.
2. Earth / info page visualizer does not show product-core texture status.
3. Random-walk dual sliders do not move in the UI.
4. Sample-and-hold random trigger parity with `web-ts` is unproven.
5. Background audio is not production-ready, especially for iOS/macOS and mobile browsers.

The production goal is:

```text
Product-core is the production runtime.
web-ts remains dev/reference/parity-only.
Earth texture, random walk, and sample-and-hold behavior are production-quality.
Runtime debug visibility exists for product-core, not only web-ts.
Browser/mobile background audio is best-effort and honestly documented.
Reliable iOS/macOS background audio is delivered through a native product-core render path.
```

---

## Current baseline assumptions

Before starting, verify these locally:

```bash
git rev-parse --short HEAD
git status --short
git ls-files src/audio/engine.ts src/audio/runtime.ts

test ! -f src/audio/engine.ts
test ! -f src/audio/runtime.ts
```

Expected:

```text
[x] src/audio/engine.ts is gone.
[x] src/audio/runtime.ts is gone.
[x] App.tsx has no direct import of root audio runtime, root audio engine, coreProductEngineHost, or reference runtime.
[x] ProductEngineProxy is the production runtime decision point.
[x] web-ts/core-smoke are dev/reference/parity-only.
[x] native bridge capability remains disabled until BG3 physical-device evidence passes.
```

If any of the above are false, stop and repair the runtime/reference quarantine before continuing.

Latest source-of-truth reconciliation:

```text
[x] git baseline a71f6534 was checked for this production evidence pass.
[x] src/audio/engine.ts and src/audio/runtime.ts are absent from the tracked source tree.
[x] ProductEngineProxy resolves web-ts/web-audio/core-smoke production requests to core-product.
[x] normal product runtime selection exposes only core-product; web-ts/core-smoke remain explicit dev/reference contexts.
[x] supports_native_bridge remains 0 and Product runtime capability reports supportsNativeBridge: false while device evidence is pending.
```

---

## Global rules

Follow these rules for all batches:

```text
1. Instrument first, then patch.
2. Do not reintroduce web-ts as a production fallback.
3. Do not route production UI around ProductEnginePort/productEngine/ProductEngineProxy.
4. Do not change DSP behavior blindly.
5. Do not use full snapshot reloads for normal slider/sequencer/FX/transport/mute/solo/journey controls.
6. Use ProductEvents, explicit product patches, or dirty-diff paths for live controls.
7. Keep browser/mobile background audio marked best-effort.
8. Reliable iOS/macOS background audio requires NativeProductRuntime calling C++ product-core directly from native audio render code.
9. Do not send realtime audio buffers through JavaScript or the Capacitor bridge.
10. Set supports_native_bridge = 1 only after native build/render/event/snapshot/asset/telemetry/device tests pass.
```

---

# Batch P0 — Product-core debug visibility

## Goal

Make product-core expose enough runtime debug/status data to diagnose Earth texture slices, random walk, and sample-and-hold behavior.

Right now, `web-ts` reference debug may have visibility that `core-product` does not. Product-core production debugging must not depend on reference runtime debug paths.

## Scope

Likely files:

```text
cpp/KesshoCore/src/product/KesshoProductTelemetry.cpp
cpp/KesshoCore/src/product/sources/SoundscapeSource.cpp
cpp/KesshoCore/src/product/sources/SourceModulation.cpp
cpp/KesshoCore/src/product/sources/SourceModulationFx.cpp
cpp/KesshoCore/src/product/ProductModulationState.h
src/audio/product/host/CoreProductTelemetryAdapter.ts
src/audio/product/host/CoreProductModulationRangeBridge.ts
src/ui/useSelectedAudioEngineDebugSurface.ts
src/ui/useProductRuntimeDebugRuntime.ts
src/ui/earth/components/ActiveEarthMatrix.tsx
src/ui/earth/components/NatureSliceViz.tsx
docs/product-core/product-debug-telemetry.md
```

## Required telemetry

### Earth texture debug

Expose, per Earth texture slot:

```text
slot key: waves / birds / birds2 / frogs
asset id
asset label or filename if available
active/inactive
inactive reason
active slice count
playing slice count
last slice id
last offset seconds or normalized offset
slice duration
output duration
detune cents
speed multiplier
total playback rate
density
fade time
seed
parity fixture enabled/disabled
texture params available true/false
asset duration
max offset
```

Inactive reasons should include:

```text
texture params missing
parity fixture enabled
asset not registered
asset not found
asset too short for offset variation
source disabled
slot muted
density zero
voice budget exceeded
```

### Random-walk debug

Expose, per active control:

```text
control key/name
target id
param id
min
max
current value
normalized position
speed
mode: local/global if applicable
last update frame/time
telemetry publish timestamp
```

### Sample-and-hold debug

Expose, per active control:

```text
control key/name
target id
param id
min
max
current value
normalized position
trigger bus
trigger counter
last trigger frame/time
last trigger source
seed/deterministic state
```

## UI requirements

```text
[x] ActiveEarthMatrix shows product-core texture debug when runtime is core-product.
[x] NatureSliceViz renders product-core texture status, not only web-ts debug status.
[x] If Earth texture is inactive, UI shows a clear inactive reason.
[x] Random-walk debug shows active keys and changing runtime positions.
[x] Sample-and-hold debug shows last trigger bus/counter/value.
[x] core-product does not report textureDebugAvailable=false when product telemetry exists.
```

## Validation

```bash
npm run type-check
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:web-host
npm run core:product:browser-runtime
```

## Exit criteria

```text
[x] Earth info page has product-core visual status.
[x] Earth texture inactive/active reasons are visible.
[x] Random-walk runtime positions are visible in product-core debug data.
[x] Sample-and-hold triggers are visible in product-core debug data.
[x] No reference runtime is required for product-core debug visibility.
```

---

# Batch P1 — Earth texture anti-repeat parity

## Goal

Fix the observed bug where Earth sample slices repeat the same sample over and over without audible variation.

The expected product behavior is close to web-ts reference behavior:

```text
normal mode:
- offsets vary over time
- pitch/detune varies over time
- speed varies over time
- unrelated UI updates do not reset the slice sequence
- recent offsets are avoided when possible

parity fixture mode:
- deterministic/repeated behavior is allowed only when explicitly enabled
- UI/debug status must clearly show parity fixture mode
```

## Investigation checklist

Instrument and answer:

```text
[x] Is product-core using texture-slice mode or falling back to one-shot asset voice mode?
[x] Is soundscapeParityFixture accidentally true in production presets/state?
[x] Are texture params present in the product snapshot?
[x] Is asset duration longer than sliceDuration enough to allow offset variation?
[x] Is maxOffset effectively zero?
[x] Is seed reset on every UI patch/snapshot refresh?
[x] Does product-core have recent-offset avoidance comparable to web-ts?
[x] Are pitch/speed randomization values being clamped to neutral?
[x] Are density/scheduler settings causing the same first slice to retrigger?
```

## Fix requirements

```text
[x] Ensure normal production Earth texture mode uses texture slices.
[x] Ensure production presets do not accidentally enable parity fixture mode.
[x] Ensure texture params are written to and read from the product snapshot.
[x] Preserve slice RNG state across unrelated UI patches.
[x] Add recent-offset avoidance if missing or too weak.
[x] Make detune/speed variation non-zero in normal mode.
[x] Add debug reason when asset is too short for meaningful offset variation.
```

## Tests to add or update

Add product/offline tests covering:

```text
same asset + normal mode + 20 scheduled slices:
- at least N distinct offsets when maxOffset is above threshold
- detune values are not all zero
- speed values are not all 1.0
- seed does not reset across unrelated UI patches
- parity fixture mode remains deterministic and labeled
- short asset case reports no-offset-variation reason
```

## Validation

```bash
npm run type-check
npm run core:product:assets
npm run core:product:source-parity
npm run core:product:determinism
npm run core:product:browser-runtime
```

## Exit criteria

```text
[ ] Earth texture slices audibly vary in normal product-core mode.
[x] Product debug shows changing offsets/detune/speed.
[x] Parity fixture mode is explicit and not accidentally enabled in production.
[x] Tests prove anti-repeat behavior.
```

---

# Batch P2 — Random-walk dual-slider movement

## Goal

Fix the observed bug where random-walk dual sliders do not move in the UI.

This may be backend, telemetry, key mapping, or UI store wiring. Do not assume it is only UI.

## Trace chain

Trace this exact chain:

```text
UI dual range set
-> productEngine.setRuntimeWalkRanges(...)
-> CoreProductModulationRangeBridge.syncRangeSet(...)
-> createCoreProductModulationRangeEvent(... randomWalk ...)
-> C++ applyModulationRangeEvent(...)
-> C++ advanceModulationRanges(...)
-> product telemetry.runtimeWalkValues
-> CoreProductModulationRangeBridge.updateRuntimeWalkPositions(...)
-> publish('runtimeWalkPositions', ...)
-> App/UI callback
-> runtimeSliderState.walkPositions[key]
-> DualSlider useRuntimeSliderIndicator(...)
```

## Debug requirements

Add counters/logging for each stage:

```text
[x] range-set calls received from UI
[x] ProductEvent emitted
[x] C++ modulation range registered
[x] C++ random walk advanced
[x] telemetry.runtimeWalkValues populated
[x] runtimeWalkPositions payload published
[x] UI runtime store updated
[x] DualSlider indicator consumed position
```

## Likely failure modes

Check:

```text
[x] telemetry.runtimeWalkValues is empty. Verified populated by browser runtime probe.
[x] runtimeWalkControlNames/runtimeWalkControlRanges are missing. Verified active bridge debug counts.
[x] setRuntimeWalkRanges is not called for the slider keys. Verified range-set calls.
[x] key differs between UI paramKey and telemetry control name. Verified masterVolume key reaches DualSlider.
[x] UI visually shows walk mode but product range mode is inactive. Verified active randomWalk debug.
[x] App/UI callback ignores runtimeWalkPositions. Fixed product-core mirror gating.
[x] DualSlider receives mode=walk but stale or undefined walkPosition. Verified changing positions.
```

## Acceptance

```text
[x] when a dual slider is in walk mode, product-core has an active randomWalk range
[x] telemetry.runtimeWalkValues contains the active key
[x] runtimeSliderState.walkPositions[key] changes over time
[x] DualSlider indicator moves without user dragging
[x] if backend is inactive, UI shows "runtime walk not active" or equivalent status
[x] random-timing sequencer sliders use product-core runtime-walk telemetry while targeting non-Lead-1 sources
[x] random-timing Piano triggers publish product-core live trigger animation callbacks
```

## Tests

```text
[x] npm run core:product:production-interactions
[x] npm run type-check
[x] npm run build
[x] npm run core:product:browser-runtime
```

Add a browser/product-runtime test:

```text
1. enable core-product
2. put a known dual slider into walk mode
3. wait 2–4 seconds
4. assert runtime walk position changed at least twice
5. assert no unsupported/fallback/full-snapshot violation
```

Run:

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:runtime-fallbacks
npm run core:product:browser-runtime
```

## Exit criteria

```text
[x] random-walk dual-slider UI indicators move in core-product
[x] telemetry confirms backend values are changing
[x] no full snapshot reloads are introduced
[x] regression test exists
```

---

# Batch P3 — Sample-and-hold parity matrix

## Goal

Prove product-core sample-and-hold random trigger behavior is up to par with web-ts/reference behavior across all supported cases.

## Create parity matrix

Create or update:

```text
docs/product-core/sample-hold-parity-matrix.md
```

Track these cases:

```text
Case 01: timed global param sample-and-hold
Case 02: source morph sample-and-hold
Case 03: source distance/expression sample-and-hold
Case 04: drum morph sample-and-hold
Case 05: drum runtime param sample-and-hold
Case 06: Delay A triggered sample-and-hold
Case 07: Delay B triggered sample-and-hold
Case 08: Granular triggered sample-and-hold
Case 09: Reverb triggered sample-and-hold
Case 10: disabled range behavior
Case 11: zero-width range behavior
Case 12: reversed min/max range behavior
Case 13: stop/resume behavior
Case 14: seeded deterministic fixture behavior
Case 15: UI flash/trigger indicator behavior
```

Table format:

```md
| Case | web-ts expected behavior | product-core path | UI feedback | Test | Status | Notes |
|---|---|---|---|---|---|---|
| 01 timed global | | | | | todo | |
```

## Required checks per case

```text
[x] target maps to correct product param id
[x] min/max range is preserved and clamped
[x] trigger source matches web-ts expectation
[x] value updates at the correct trigger time
[x] UI trigger position/flash updates
[x] deterministic fixture behavior is stable
[x] stop/resume behavior matches expectation
[x] no full snapshot reload occurs for normal trigger behavior
[x] unsupported/fallback counters remain zero
```

## Fix requirements

Patch only after the matrix identifies the failing case.

Likely files:

```text
cpp/KesshoCore/src/product/sources/SourceModulation.cpp
cpp/KesshoCore/src/product/sources/SourceModulationFx.cpp
cpp/KesshoCore/src/product/ProductModulationState.h
src/audio/product/host/CoreProductModulationRangeBridge.ts
src/ui/runtimeSliderState.ts
src/ui/DualSlider.tsx
```

## Tests

Add or update:

```text
core:product:sample-hold-parity
```

If the script does not exist, create it or add equivalent tests under existing source-parity/determinism/product-runtime gates.

Run:

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:determinism
npm run core:product:source-parity
npm run core:product:browser-runtime
```

## Exit criteria

```text
[x] sample-hold parity matrix exists
[x] every case is pass, intentionally different, or explicitly unsupported with reason
[x] product-core trigger behavior matches web-ts where required
[x] UI trigger feedback works
[x] regression tests exist
```

---

# Batch P4 — Product-core production interaction gate expansion

## Goal

Make the Earth/random-walk/sample-hold bugs impossible to reintroduce.

## Add scripted interactions

Add or extend product-runtime/Playwright interactions:

```text
Earth:
- enable waves
- enable birds
- enable birds2
- enable frogs
- verify texture debug active
- verify offsets vary
- verify detune or speed varies
- verify no repeated first-slice loop

Random walk:
- enable walk mode on representative dual sliders
- verify UI positions move
- verify backend telemetry changes

Sample hold:
- enable sampleHold on representative sliders
- trigger timed case
- trigger Delay A case
- trigger Delay B case
- trigger Granular case
- trigger Reverb case
- verify trigger positions/flash/counters update

Diagnostics:
- unsupportedControlCount = 0
- unsupportedGetterCount = 0
- runtimeFallbackDiagnosticCount = 0
- audioCriticalFallbackCount = 0
- no disallowed full snapshot reload for normal controls
```

## Validation

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:architecture
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:dirty-diff
npm run core:product:patch-bridges
npm run core:product:snapshot-authority
npm run core:product:browser-runtime
npm run migration:runtime-production-gates
```

## Exit criteria

```text
[x] production interaction gate covers Earth texture variation
[x] production interaction gate covers random-walk slider movement
[x] production interaction gate covers sample-hold trigger cases
[x] diagnostics stay clean
[x] no disallowed full snapshots occur
```

---

# Batch BG0 — Background audio requirements and test matrix

## Goal

Define honest, testable background audio requirements.

Browser/mobile background audio is best-effort. Reliable iOS/macOS background audio requires native product-core rendering.

## Create docs

Create:

```text
docs/product-core/background-audio.md
docs/product-core/background-audio-test-matrix.md
```

## Requirements

### Browser/mobile

Mark as best-effort:

```text
[x] foreground playback stable
[x] visible-page wake-lock mode where supported
[x] Media Session metadata/actions where supported
[x] Page Visibility/Page Lifecycle diagnostics
[x] graceful resume after suspension
[x] clear user-facing limitations
```

Do not promise guaranteed browser/mobile background playback.

### Native iOS/macOS

Mark as required for reliable background audio:

```text
[x] NativeProductRuntime
[x] native C++ product-core library/framework
[x] direct render callback calling kessho_product_render
[x] no realtime audio buffers through JS/Capacitor bridge
[x] lock-free event queue
[x] telemetry double buffer
[x] native asset registration off audio thread
[x] AVAudioSession playback/background audio integration
[x] Now Playing / remote commands
[x] route change/interruption handling
[ ] device tests
```

## Test matrix

```md
# Background Audio Test Matrix

| Platform | Scenario | Expected | Status | Notes |
|---|---|---|---|---|
| iOS Safari | foreground | best-effort pass | todo | |
| iOS Safari | screen lock | best-effort / not guaranteed | todo | |
| iOS Safari | app switch | best-effort / not guaranteed | todo | |
| Android Chrome | foreground | best-effort pass | todo | |
| Android Chrome | screen lock | best-effort / not guaranteed | todo | |
| Capacitor iOS native | screen lock | guaranteed if native renderer active | todo | |
| Capacitor iOS native | app background | guaranteed within iOS background audio rules | todo | |
| Capacitor iOS native | Control Center play/pause | pass | todo | |
| Capacitor iOS native | AirPods route change | pass | todo | |
| macOS native | app hidden/minimized | pass | todo | |
| macOS native | sleep/wake | safe recovery | todo | |
```

## Exit criteria

```text
[x] docs distinguish browser best-effort from native reliable background audio
[x] test matrix exists
[x] unsupported browser cases are not presented as product guarantees
```

---

# Batch BG1 — Browser/mobile best-effort background support

## Goal

Improve browser/mobile behavior without falsely promising guaranteed background audio.

## Work

Implement or verify:

```text
[x] Media Session metadata
[x] Media Session play/pause/stop actions
[x] Page Visibility diagnostics
[x] Page Lifecycle diagnostics where supported
[x] AudioContext suspend/interruption/resume handling
[x] visible-page Wake Lock option
[x] user-facing status:
    - foreground
    - hidden
    - suspended
    - resumed
    - wake lock active/released
```

## Do not do

```text
[x] do not claim browser/mobile background playback is guaranteed
[x] do not rely on silent audio hacks
[x] do not route product-core render through non-realtime-safe browser workarounds
```

## Validation

```bash
npm run type-check
npm run core:product:browser-runtime
npm run migration:docs
```

Manual/device tests:

```text
iOS Safari foreground
iOS Safari screen lock
iOS Safari app switch
Android Chrome foreground
Android Chrome screen lock
Android Chrome app switch
```

## Exit criteria

```text
[x] browser/mobile best-effort behavior works where platform allows
[x] app resumes gracefully after suspension
[x] limitations are documented and visible to the user
```

---

# Batch BG2 — Native iOS/macOS product-core renderer

## Goal

Create the real path for reliable background audio on iOS/macOS.

## Architecture

```text
UI / JS control surface
-> ProductEnginePort
-> NativeProductEngine
-> Swift/ObjC bridge
-> native C ABI wrapper
-> C++ product-core
-> AVAudioEngine/CoreAudio render callback
```

## Work

```text
[x] native KesshoProductCore build target for iOS
[x] native KesshoProductCore build target for macOS
[x] macOS app target links the native KesshoProductCore library
[x] Swift/ObjC bridge exposed over generated product snapshot/event structs
[x] NativeProductEngine wrapper:
    - create/destroy/reset
    - loadSnapshot
    - enqueueEvent(s)
    - render
    - copyTelemetry
    - register/unregister assets
[x] AVAudioEngine/CoreAudio render adapter
[x] lock-free event queue from UI/JS to native render thread
[x] preallocated render buffers
[x] telemetry double buffer from audio thread to UI thread
[x] asset decode/resample/register off audio thread
[x] route-change handling hooks on native renderer
[x] interruption handling hooks on native renderer
[x] Now Playing / remote command integration
```

## Realtime rules

```text
[x] no allocations in render callback
[x] no locks in render callback
[x] no JS calls in render callback
[x] no Capacitor bridge calls in render callback
[x] no asset decode on render thread
```

## Validation

Add native tests:

```text
[x] native adapter build smoke
[x] macOS native ObjC bridge/source-node consumer target smoke
[x] macOS AVAudioEngine lifecycle smoke
[x] macOS app target imports KesshoProductCore and exposes native Product Core diagnostics through the existing bridge surface
[x] macOS app executable has a non-GUI native Product Core diagnostics smoke mode
[x] macOS app executable has a non-GUI native background/recovery preflight for hidden and sleep/wake handlers
[x] iOS audio-session native renderer lifecycle wiring smoke
[x] iOS audio-session native offline output probe wiring smoke
[x] JS/native diagnostic bridge exposes scalar native output probe without realtime buffers
[x] Product Core debug panel surfaces native scalar probe status for device tests
[x] Product Core debug panel surfaces native remote-command evidence for device tests
[x] Product Core debug panel surfaces native route/interruption/media-services event counters for device tests
[x] iOS app declares UIBackgroundModes audio for native background testing
[x] iOS simulator app build links audio-session plugin to native product-core package
[x] native render smoke
[x] event enqueue roundtrip
[x] snapshot load roundtrip
[x] asset registration
[x] telemetry copy
[x] route change through native renderer
[x] interruption handling through native renderer
```

Run existing gates:

```bash
npm run type-check
npm run core:product:schema
npm run core:product:ci
npm run migration:docs
```

Run native platform tests through the appropriate Xcode/native commands.

Latest local validation:

```text
[x] npm run core:product:wasm verifies product worklet/schema hash and pointer-relative Earth telemetry reads
[x] npm run build refreshes dist with patched product worklet
[x] npm run core:product:browser-runtime verifies Earth texture telemetry from served production bundle
[x] npm run core:product:native-render-path verifies native render/event/snapshot/asset/telemetry adapter
[x] npm run core:product:macos-native-smoke verifies macOS app target links and renders non-silent Product Core output through KesshoProductCore
[x] swift build --package-path CapacitorMac verifies the macOS app target links KesshoProductCore
[x] npm run cap:mac:build verifies the packaged macOS app links KesshoProductCore in release mode
[x] npm run core:product:macos-app-native-smoke verifies the macOS app executable can probe/start/stop native Product Core diagnostics
[x] npm run core:product:macos-app-background-smoke verifies macOS app hidden and sleep/wake handlers drive native Product Core counters/recovery
[x] npm run type-check verifies JS/native diagnostic bridge typing
[x] xcodebuild iOS simulator Debug build verifies Swift-facing native output probe and live diagnostic priming compile
[x] current xcodebuild iOS simulator Debug build verifies native iOS target still links Product Core after macOS app target changes
[x] npm run core:product:background-audio verifies native/browser background support contract remains honest
[x] npm run core:product:background-audio-docs verifies background audio docs and matrix wording
[x] npm run core:product:background-audio-device-evidence verifies BG2/BG3 device evidence remains explicit and blocks native capability while pending
[x] device evidence gate requires dated tester/evidence for manual-pending/fail/pass rows and row-specific scalar/counter tokens for pass rows
[x] device evidence recorder script updates physical test rows through the same gate, with dry-run support before writing
[x] device evidence gate self-checks recorder dry-run accept/reject behavior and verifies dry-run does not mutate the ledger
[x] device evidence checker and recorder share one row/status/pass-token contract to prevent drift
[x] generated physical device checklist reads the same row/pass-token contract and is self-checked by the evidence gate
[x] npm run core:product:native-capability-signoff maps BG3 requirements to device evidence and keeps native capability disabled while rows are pending
```

## Exit criteria

```text
[ ] native iOS renderer produces audio through product-core on device
[x] native macOS renderer produces audio through product-core
[x] render callback calls product-core directly
[x] event/snapshot/asset/telemetry native adapter tests pass
[ ] background audio device tests pass
[x] supports_native_bridge remains 0 until all above pass
```

---

# Batch BG3 — Native capability flip and release signoff

## Goal

Enable native product-core only after real tests pass.

## Requirements before flipping

```text
[x] iOS native build passes
[x] macOS native build passes
[x] native render smoke passes
[x] native event/snapshot tests pass
[x] native asset registration tests pass
[x] native telemetry copy tests pass
[ ] iOS screen-lock background audio test passes
[ ] iOS app-background audio test passes
[ ] iOS Control Center remote command test passes
[ ] iOS route/interruption tests pass
[ ] macOS hidden/minimized audio test passes
[ ] macOS sleep/wake recovery test passes
[ ] docs updated from deferred to supported
```

## Then

```text
[ ] set supports_native_bridge = 1
[ ] expose native-product only on supported platforms/builds
[ ] keep web browser runtime as WebProductEngine/WASM
[ ] keep mobile browser background support documented as best-effort
```

## Final validation

```bash
npm run type-check
npm run core:product:ci
npm run migration:docs
```

plus native CI/device test suite.

## Exit criteria

```text
[ ] native-product is real and tested
[ ] iOS/macOS background audio works through native product-core
[ ] browser/mobile limitations are documented
[ ] product-core background-audio milestone is complete
```

---

# Required report format after every batch

Use exactly this format:

```text
Batch:
- <batch id and name>

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

Device/manual tests:
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

# Immediate execution order

Use this exact order:

```text
P0. Product-core debug visibility
P1. Earth texture anti-repeat parity
P2. Random-walk dual-slider movement
P3. Sample-and-hold parity matrix
P4. Product-core production interaction gate expansion
BG0. Background audio requirements and test matrix
BG1. Browser/mobile best-effort background support
BG2. Native iOS/macOS product-core renderer
BG3. Native capability flip and release signoff
```

Do not start native background rendering until P0–P4 are complete. The product-core runtime must be observable and behaviorally stable before nativeizing it.

---

# Goal completion definition

The **product-core production stabilization goal** is complete when:

```text
[x] Earth texture slices vary correctly in product-core normal mode by scripted telemetry gates; final manual audible confirmation remains separate device evidence.
[x] Earth/info visualizer shows product-core texture status.
[x] Random-walk dual-slider indicators move from product-core runtime telemetry.
[x] Sample-and-hold parity matrix passes or documents intentional differences.
[x] Production interaction gates cover Earth, random walk, and sample-hold.
[x] Diagnostics show zero unsupported/fallback/audio-critical failures.
[x] Browser/mobile background audio is implemented as best-effort and documented honestly.
[x] Native iOS/macOS reliable background audio remains gated by physical-device evidence, supports_native_bridge stays 0, and the product does not claim reliable native background audio while BG3 is pending.
```

The **full background-audio product goal** is complete only when:

```text
[ ] Native iOS product-core background audio passes device tests.
[ ] Native macOS product-core background audio passes device tests.
[ ] supports_native_bridge = 1.
[ ] native-product is exposed only on supported builds.
[ ] mobile browser background audio remains documented as best-effort.
```
