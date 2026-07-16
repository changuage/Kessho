# Product Core Background-Audio Low-Risk CPU Follow-up Plan

## Implementation Status — Complete (2026-07-16)

All three change sets are implemented and their focused gates pass. Generated Product worklet/WASM artifacts and the runtime asset version are current.

- Debug voice-spawn hashing defaults off and is enabled only by explicit, visible diagnostic demand.
- Render-time modulation advancement iterates the deterministic ordered list of active ranges.
- In-use asset releases retry every 50 ms of rendered audio while new requests are attempted immediately.
- Determinism, realtime safety, native focused tests, WASM smoke, asset-release tests, type checking, web-host checks, generated-file checks, and `git diff --check` pass.
- The single CPU run reported disabled FX at 4.84695% average / 5.3625% peak and active FX at 8.19375% average / 9.465% peak, with zero missed render quanta.
- Physical-iPhone, hour-long, browser-endurance, and CPU-repeatability tests were intentionally not run.
- No implementation changes were made to the reference Web-TS runtime, graph-capture policy, bus-clearing policy, Journey/Morph behavior, or audio-quality settings as part of this plan.

## Purpose

This is an implementation script that should not make architectural decisions.

Implement exactly three sound-preserving optimizations:

1. Stop computing debug voice-spawn hashes unless an explicit diagnostic consumer requests them.
2. Iterate only active modulation ranges during the render-time random-walk/sample-and-hold update.
3. Retry deferred asset releases at a bounded cadence instead of once per audio quantum.

The goal is lower Product Core CPU during normal and screen-off browser playback without changing PCM, musical timing, random sequences, voice lifetime, asset safety, or audio quality.

## Scope Rules

1. Work only in Product Core. Do not edit `src/audio/reference/webTs/` or reference-runtime behavior.
2. Do not implement graph-capture suspension or conditional audio-bus clearing in this change.
3. Do not change Journey/Morph behavior in this change. Moving audible Journey/Morph automation into native sample-frame scheduling requires a separate plan.
4. Do not reduce voice counts, modulation rates, effect quality, sample quality, or background asset closure.
5. Add only the focused assertions listed below. Do not add exhaustive suites.
6. Do not run hour-long tests, browser endurance tests, CPU repeatability runs, or physical-iPhone tests.
7. Keep all real-time structures fixed-capacity. Do not allocate, lock, log, throw, or use dynamic containers from C++ render code.
8. Preserve deterministic iteration order and random-number consumption exactly.
9. Use the authoritative worklet source at `cpp/KesshoCore/adapters/wasm/kessho-core-product.worklet.js`. Regenerate public output; never edit the public Product worklet directly.
10. Complete the three change sets in order. Run each focused gate before starting the next one.

## Files Expected to Change

Core/API:

- `cpp/KesshoCore/src/product/ProductState.h`
- `cpp/KesshoCore/src/product/KesshoProductTelemetry.cpp`
- `cpp/KesshoCore/src/product/KesshoProductApi.cpp`
- `cpp/KesshoCore/include/KesshoCore/KesshoProductCore.h`
- `cpp/KesshoCore/src/product/sources/SourceModulationRoutes.cpp`
- `cpp/KesshoCore/src/product/sources/SourceModulationRuntime.cpp`

Web/WASM host:

- `cpp/KesshoCore/adapters/wasm/kessho-core-product.worklet.js`
- `scripts/kessho-core-build-manifest.mjs`
- `scripts/check-kessho-product-wasm.mjs`
- `scripts/check-kessho-product-web-host.mjs`

Focused tests:

- `cpp/KesshoCore/tests/ProductSequencerTests.cpp`
- Existing test files only if a current focused test is a better home. Do not create a broad new suite.

Generated artifacts:

- `public/worklets/kessho-core-product.worklet.js`
- `public/worklets/kessho_core.wasm`
- `src/audio/generated/coreProductRuntimeAssetVersion.ts`

## Change Set 1: Demand-Gate Debug Voice-Spawn Hashing

### Current problem

`KesshoProductEngine::recordDebugVoiceSpawn()` calls `debugSourceState()` for every spawned voice. That computes source, compiled-source, and override hashes even though the browser host does not consume `debug_voice_spawns` during normal playback.

### Required implementation

1. Add this field beside `debug_voice_spawn_sequence` in `ProductState.h`:

```cpp
bool debug_voice_spawn_demand_enabled = false;
```

2. At the first line of `recordDebugVoiceSpawn()` in `KesshoProductTelemetry.cpp`, return immediately when demand is disabled:

```cpp
if (!debug_voice_spawn_demand_enabled) return;
```

Do not compute `debugSourceState()`, increment `debug_voice_spawn_sequence`, or mutate `telemetry.debug_voice_spawns` while disabled.

3. Add this C API declaration to `KesshoProductCore.h` next to meter demand:

```cpp
int32_t kessho_product_set_debug_voice_spawn_demand(
    KesshoProductEngine* engine,
    uint32_t enabled);
```

4. Implement it in `KesshoProductApi.cpp`:

- Return `KESSHO_PRODUCT_ERROR_INVALID_ENGINE` for `nullptr`.
- Set `debug_voice_spawn_demand_enabled = enabled != 0u`.
- When disabling, do not clear historical telemetry. Disabling only stops new records.
- Return `KESSHO_PRODUCT_OK`.

5. Add `kessho_product_set_debug_voice_spawn_demand` to `kesshoCoreWasmExportedFunctions` in `scripts/kessho-core-build-manifest.mjs`.

6. Resolve the new function in the authoritative Product worklet API object.

7. Add worklet state:

```js
this.hostDebugVoiceSpawnDemand = false;
this.coreDebugVoiceSpawnDemand = null;
```

8. Add `syncDebugVoiceSpawnDemand()` with this exact policy:

```js
const enabled = this.hostDebugVoiceSpawnDemand && !this.hostHidden;
```

Call the C API only when `enabled` differs from `coreDebugVoiceSpawnDemand`.

9. Handle this explicit worklet message:

```js
{ type: 'debug-voice-spawn-demand', enabled: boolean }
```

Update `hostDebugVoiceSpawnDemand`, then call `syncDebugVoiceSpawnDemand()`.

10. In the existing `host-visibility` handler, call `syncDebugVoiceSpawnDemand()` after updating `hostHidden`.

11. Default demand must remain false. Do not connect it to ordinary telemetry, visual telemetry, meters, stems, or performance monitoring. No production caller currently needs these hashes.

### Focused tests

Add one compact C++ test function to `ProductSequencerTests.cpp`:

1. Create/load the smallest existing snapshot fixture that can trigger one voice.
2. Trigger/render once with default demand disabled; assert `debug_voice_spawn_count == 0`.
3. Enable demand through the public C API.
4. Trigger/render once; assert the count increments and the expected source ID is recorded.
5. Disable demand, trigger/render once, and assert the count no longer changes.

Update the existing running Pad endpoint hot-swap test that reads debug voice spawns:

- Enable debug voice-spawn demand immediately before its first diagnostic trigger.
- Disable it after the last diagnostic assertion.

Add focused assertions to the existing worklet fixture in `check-kessho-product-wasm.mjs`:

- Default initialization sends disabled state to C++ or leaves it disabled.
- Explicit enable while visible calls the C API with `1`.
- `host-visibility: hidden` calls it with `0`.
- Returning visible restores `1` only if host demand is still true.

### Gate

Run:

```bash
node scripts/run-kessho-product-cpp-test.mjs ProductSequencerTests
npm run core:product:wasm
```

Do not continue until both pass.

## Change Set 2: Iterate Only Active Modulation Ranges

### Current problem

`advanceModulationRanges()` scans all 96 fixed slots every render quantum. `rebuildModulationRouteCache()` already knows the active range count but does not retain an ordered active-index list.

### Required implementation

1. Add this fixed-capacity field beside `active_modulation_range_count` in `ProductState.h`:

```cpp
uint16_t active_modulation_range_indices[kMaxModulationRanges]{};
```

2. In `resetModulationRouteCache()`:

- Set `active_modulation_range_count = 0u` as today.
- Fill `active_modulation_range_indices` with `kInvalidModulationRouteIndex`.

3. In `rebuildModulationRouteCache()`, when an active range is encountered during the existing ascending `range_index` scan:

```cpp
active_modulation_range_indices[active_modulation_range_count] =
    static_cast<uint16_t>(range_index);
++active_modulation_range_count;
```

Do this before route-specific `continue` statements. Every active range must appear in the list, including control-only and soundscape asset-level ranges.

4. In `advanceModulationRanges()`:

- Return immediately for `frames == 0u` or `active_modulation_range_count == 0u`.
- Replace the full-array loop with an index loop from `0` to `active_modulation_range_count`.
- Resolve each slot through `active_modulation_range_indices`.
- Skip an index if it is outside `kMaxModulationRanges` as a defensive guard.
- Keep the existing body unchanged after selecting `ModulationRange& range`.

5. Do not reorder active ranges. Ascending slot order must match the old array scan so simultaneous random-walk/sample-and-hold updates preserve deterministic behavior.

6. Do not compact or move `modulation_ranges`. Other route caches store stable slot indices.

7. Do not change random-walk tick duration, catch-up cap, seeds, counters, interpolation, or application order.

### Focused tests

Add one compact C++ test to the existing Product sequencer modulation section:

1. Configure three active modulation ranges with at least one inactive slot between active slots.
2. Assert `active_modulation_range_count == 3`.
3. Assert the three stored active indices are ascending and point to active ranges.
4. Disable the middle range through the normal event path.
5. Assert the rebuilt list contains only the two remaining indices in ascending order.
6. Advance exactly the existing test interval and assert the two active ranges move while the disabled range does not change.

Existing random-walk movement tests remain the behavioral parity coverage. Do not duplicate them.

### Gate

Run:

```bash
node scripts/run-kessho-product-cpp-test.mjs ProductSequencerTests
npm run core:product:determinism
npm run core:product:realtime-safety
```

Do not continue until all pass.

## Change Set 3: Bound Deferred Asset-Release Retry Cadence

### Current problem

The worklet calls `unregisterAsset()` for every pending release on every 128-frame render quantum. A long-running voice can therefore cause hundreds of failed `ASSET_IN_USE` calls per second.

### Required implementation

1. Add a constant near the existing asset/worklet constants:

```js
const ASSET_RELEASE_RETRY_SECONDS = 0.05;
```

This is a 20 Hz retry cadence. Do not choose a different value.

2. Add worklet state:

```js
this.assetReleaseRetryCountdownBlocks = 0;
this.assetReleaseRetryIntervalBlocks = Math.max(
  1,
  Math.ceil((sampleRate * ASSET_RELEASE_RETRY_SECONDS) / this.frames),
);
```

3. When a new asset release request is added to an empty `pendingAssetReleases` set, set `assetReleaseRetryCountdownBlocks = 0` so the next render block attempts release immediately.

4. Change `retryPendingAssetReleases()`:

- If the set is empty, set the countdown to `0` and return.
- If the countdown is greater than `0`, decrement it and return without calling C++.
- Otherwise set it to `assetReleaseRetryIntervalBlocks - 1`, then run the existing release loop once.
- Keep exactly-once pointer freeing and completion/failure messages unchanged.
- When the last pending release completes or fails, reset the countdown to `0`.

5. Do not use `setTimeout`, `setInterval`, promises, or host wall time. The cadence must be driven by audio render blocks.

6. A successful release may be delayed by at most 50 ms after a voice becomes releasable. Do not delay initial release requests.

### Focused tests

Modify only the deferred-release fixture already present in `scripts/check-kessho-product-wasm.mjs`:

1. The first process block after a release request must call unregister immediately and receive `ASSET_IN_USE`.
2. Processing fewer than `assetReleaseRetryIntervalBlocks` additional blocks must not call unregister again.
3. The next due block must call unregister once, succeed, free pointers exactly once, and emit one completion message.
4. A second release request after the queue becomes empty must again attempt immediately.

Do not add a long loop or endurance case.

### Gate

Run:

```bash
npm run core:product:wasm
npm run test:core-product-asset-release
```

Do not continue until both pass.

## Final Build and Focused Validation

After all three change sets pass their local gates:

```bash
npm run core:product:generate
npm run core:build:wasm
npm run generate:core-product-runtime-asset-version
npm run type-check
node scripts/check-generated-files-clean.mjs
npm run core:product:web-host
npm run core:product:wasm
npm run core:product:cpu
git diff --check
```

Run `core:product:cpu` once only. Do not run `core:product:cpu-repeatability`.

## Acceptance Criteria

All of the following must be true:

1. Default browser/Product Core playback records zero debug voice-spawn hashes.
2. Explicit visible diagnostic demand records voice-spawn hashes; hiding disables it; visibility restoration re-enables only an outstanding explicit request.
3. PCM determinism and realtime-safety checks pass unchanged.
4. Active modulation ranges update in the same ascending slot order as before.
5. Inactive modulation slots are not visited by `advanceModulationRanges()`.
6. Random-walk and sample-and-hold seeds, counters, values, and timing remain unchanged in existing tests.
7. A newly requested asset release is attempted immediately.
8. An in-use asset is retried at 20 Hz, not every audio quantum.
9. Asset memory is freed exactly once only after Product Core returns success.
10. Generated worklet output and WASM are current.
11. The focused CPU run shows no regression in missed render quanta and no greater than 3% regression in mean CPU. Record the result; do not tune audio quality to meet it.
12. No changes appear under `src/audio/reference/webTs/`.

## Stop Conditions

Stop and report instead of improvising if any of these occurs:

- PCM determinism changes.
- Random-walk or sample-and-hold values diverge.
- An asset allocation is freed before Product Core returns success.
- A required test needs a dynamic allocation or lock on the render path.
- Conditional bus clearing or graph-capture behavior appears necessary.
- Journey/Morph changes become necessary.
- Completing the work would require physical-device or hour-long testing.

## Required Handoff

Report:

1. Files changed for each change set.
2. The exact focused assertions added.
3. Commands run and pass/fail results.
4. The single before/after CPU result if a baseline is available in the current session.
5. Confirmation that no reference `web-ts`, graph-capture policy, bus-clearing policy, Journey/Morph behavior, audio quality, or physical-device evidence was changed.
