# Shared Product Core CPU and Mobile Background Implementation Plan

## Purpose

This plan is an implementation script for an engineer who should not need to make architectural decisions while coding.

Primary goals:

1. Reduce Product Core render CPU for the web app and the current iOS/macOS WebView apps.
2. Bound decoded-audio memory and asset-load spikes on mobile.
3. Make iOS Safari and Chrome background playback use audio-only work as far as browser policy permits.
4. Preserve the current sound. CPU work must not lower voice counts, sample quality, effects quality, or modulation rates.
5. Leave a sample-frame scheduling contract that native MIDI can use later.

Native Apple audio routing is intentionally last. The current Apple apps use the same WebAudio/WASM Product Core path as the browser, so phases 0-9 benefit all three current products. Native routing is not required to implement or measure those phases.

## Implementation Status (2026-07-16)

The shared Product Core implementation work for phases 0-8 is complete. The software milestone is green for Product Core; physical iPhone evidence is intentionally deferred to the final acceptance checkpoint.

| Phase | Status | Evidence summary |
| --- | --- | --- |
| 0 | Software complete; device baselines pending | Evidence schemas, recorders, validators, CPU reports, and memory reports are implemented. Required physical iPhone baselines remain part of phase 9 acceptance. |
| 1 | Complete | The adapter worklet is authoritative and generated output is deterministic. |
| 2 | Complete | Telemetry and meters are demand-driven; normal rendering performs no full telemetry scan. |
| 3 | Complete | Stem capture and metering are opt-in and disabled for normal stereo playback. |
| 4 | Complete | Asset release is deferred until Product Core acknowledges that no active voice uses the allocation. |
| 5 | Complete | Mobile asset admission, serialized decoding, transfer ownership, cache take/release, allocation accounting, and explicit background asset closure are bounded. Required prediction is uncapped unless a caller explicitly requests a cap. |
| 6 | Complete in software | Browser audio-session ownership, gesture-preserving carrier activation, interruption handling, and native-shell exclusion pass automated checks. |
| 7 | Complete | Hidden UI/diagnostic scheduling is suppressed while Product Core audio rendering continues. Journey and host morph animation pause without hidden polling and resume from visibility transitions. |
| 8 | Complete | Arrangement, harmony, chord, lead, sequencer-chain, and scheduled-evolve timing are Product Core-owned and advance from sample frames. The retired wall-clock arrangement implementation lives only at `src/audio/reference/CoreProductArrangementSchedulerReference.ts` for development parity; production uses timer-free host projections/configuration bridges. |
| 9 | Pending final checkpoint | Run the physical matrix on iPhone 11 and a current iPhone only after all software work is frozen. |
| 10 | Not started | Must remain blocked until phase 9 passes. |

Latest Product Core CPU repeatability evidence: disabled effects `4.85700%` median mean with `0.450%` spread, active effects `8.09904%` median mean with `1.344%` spread, and zero missed render quanta across all three runs. The sampler loop-boundary stress case measured `4.33535%` mean / `4.71563%` peak with zero missed quanta.

Current validation scope is Product Core. Reference `web-ts` runtime cases are not part of this milestone's remaining work; deterministic offline reference fixtures may still be used to prove Product Core output and event parity.

The current requirement-to-evidence audit is recorded in `docs/reports/shared-cpu-mobile-background-software-audit-latest.md`.

The final code audit also closed three narrow gaps: hidden Morph/Journey polling, false-ready or incomplete background asset closure (including both Piano variants at MIDI 37), and host/telemetry-driven sequencer chain/evolve cadence. Focused regressions cover only those failures.

## Code-Validated Starting State

| Area | Current source behavior | Consequence |
| --- | --- | --- |
| Product telemetry | `KesshoProductEngine::render()` calls `updateTelemetry(frames)` every render block in `cpp/KesshoCore/src/product/KesshoProductRender.cpp`. | Large diagnostic state is rebuilt on the real-time path even when no host requests it. |
| Stems | Product Core clears and writes stem buffers every block. The worklet also probes stem peaks periodically. | Normal stereo playback pays for multichannel diagnostic/DAW data it does not consume. |
| Host telemetry | `src/audio/coreProductRuntime.ts` stops telemetry and visual polling while hidden. | This part is already correct; do not reimplement it. |
| UI scheduling | `ProductFrameScheduler` and `ProductRuntimeScheduler` use hidden-page timers. | Hidden pages still wake to publish UI/diagnostic state. |
| Musical scheduling | `src/audio/coreProductArrangementScheduler.ts` uses wall-clock `setTimeout()` for harmony, chords, lead phrases, and delayed notes. | Browser timer suspension can stop future musical events while the audio worklet continues. |
| Asset cache | `SampleDecodedAssetCache` has retention and background-prune APIs. | Useful policy exists, but it only removes host JS copies. |
| WASM assets | `CoreProductAssetRegistrar` records registered bytes but does not evict obsolete Product Core registrations. | A long session can accumulate decoded assets in the WASM heap. |
| Asset release | The worklet frees WASM pointers immediately after calling `kessho_product_unregister_asset_buffer()`. C++ currently clears the asset slot without checking active voices. | An active voice can be cut off, and the worklet has no release acknowledgement protocol. |
| Asset transfer | Runtime registration clones every decoded channel before transferring it; the worklet then copies it into WASM. | Large assets temporarily exist as host data, a transfer clone, and a WASM copy. |
| iOS carrier | `CoreProductRuntime` routes iOS output through a `MediaStreamAudioDestinationNode` and an `HTMLAudioElement`. | A useful background carrier exists, but its `play()` call can occur after user activation has expired. |
| Browser session APIs | Media Session handlers exist in `src/ui/audioEngineMediaSession.ts`; no `navigator.audioSession` integration exists. | Lock-screen controls exist, but the browser is not explicitly told that the session is playback. |
| Memory baseline | The asset check currently reports about 177.3 MiB startup decoded data, 234.1 MiB total registered decoded data, and a 235.2 MiB grown WASM heap. Maximum configured WASM memory is 384 MiB. | The current ceiling is too permissive to use as a mobile operating target. Freeing allocations will not necessarily shrink a grown WASM heap. |
| Snapshot/event batching | The web host already batches Product Core events and state patches. | Keep and benchmark it; do not build a second batching layer. |

## Non-Negotiable Rules

1. Implement phases in order. The only permitted parallel work is noted in the phase table.
2. Add or change a regression test before changing behavior.
3. Do not merge a phase when its phase gate fails, even if the full build succeeds.
4. Edit Product worklet behavior in the authoritative source introduced by phase 1. Regenerate `public/worklets/kessho-core-product.worklet.js`; do not hand-edit the public file after phase 1.
5. Never free an asset allocation until Product Core returns `KESSHO_PRODUCT_OK` for that exact asset release.
6. Never decode, fetch, generate UI telemetry, or run visualization callbacks after the page becomes hidden.
7. Do not add a silent oscillator, repeated resume loop, Wake Lock dependency, or browser-specific Safari/Chrome audio implementation.
8. Do not reduce audio quality to pass CPU tests.
9. Treat browser background playback as best effort. Only physical-device evidence can mark it accepted.
10. Run targeted tests after each phase and the full gate only at the milestones identified below.

### Repeat this loop for every phase

1. Record `git status --short`; do not remove unrelated work.
2. Run the phase's listed commands and save the baseline result.
3. Add the phase's regression tests and confirm at least one new assertion fails for the current behavior.
4. Implement only that phase. Do not start the next phase in the same change set.
5. Regenerate Product bindings/worklets when C++ ABI, schema, events, exports, or worklet behavior changes.
6. Run the targeted phase commands until they pass.
7. Run the relevant CPU or memory scenario three times and record median before/after values.
8. Run `git diff --check` and inspect the complete diff for generated noise or unrelated edits.
9. Mark the phase complete only when every listed success criterion is demonstrated.

## Process Order

| Phase | Change set | Dependency | Applies to | Expected result |
| --- | --- | --- | --- | --- |
| 0 | Reproducible baseline and evidence schema | None | All | Trustworthy before/after data |
| 1 | Authoritative Product worklet source | 0 | Web/WASM hosts | Safe worklet maintenance |
| 2 | Demand-driven Product Core telemetry | 1 | Web, iOS app, macOS app, future native | Lower steady render CPU |
| 3 | Opt-in stems and stem metering | 2 | Web, iOS app, macOS app, future native | Lower stereo playback CPU |
| 4 | Safe deferred asset release | 1 | All Product Core hosts | Enables memory eviction without cutoffs |
| 5 | Mobile working-set budget and transfer ownership | 4 | Web and current apps | Lower retained and transient memory |
| 6 | iOS browser audio-session and carrier activation | 1 | iOS browser/current iOS app | Better browser-policy integration |
| 7 | Hidden audio-only host mode | 2, 3, 5, 6 | Browser/current apps | No hidden UI work |
| 8 | Sample-frame arrangement scheduling | 5, 7 | All Product Core hosts | Background-safe musical timing |
| 9 | Device acceptance and rollout gate | 2-8 | iOS browser/current apps | Evidence on iPhone 11 and a current device |
| 10 | Production native Apple routing and native MIDI queue | 9 | Installed apps | Additional app-only CPU/latency benefit |

After phase 1, phases 2-3 and phase 4 may be developed in parallel on separate branches. Merge phase 2 before phase 3. Merge phase 4 before phase 5. A single implementer should simply follow the numeric order.

### Planning effort

These are implementation ranges for one experienced engineer, excluding waits for physical-device access:

| Phase | Expected effort |
| --- | --- |
| 0 | 2-4 engineer-days |
| 1 | 1-2 engineer-days |
| 2 | 3-5 engineer-days |
| 3 | 3-6 engineer-days |
| 4 | 4-7 engineer-days |
| 5 | 5-9 engineer-days |
| 6 | 3-5 engineer-days |
| 7 | 3-5 engineer-days |
| 8A | 2-4 engineer-days |
| 8B-8D | 15-30 engineer-days |
| 9 | 4-8 device-days |
| 10 | 15-30 engineer-days |

Do not compress phases 4, 5, or 8 by dropping tests. Their risk is data lifetime and render timing, not code volume.

## Phase 0: Establish Baseline and Evidence

### Files

- Add `scripts/check-kessho-product-mobile-web-evidence.mjs`.
- Add `scripts/record-kessho-product-mobile-web-evidence.mjs`.
- Add a package script for each command.
- Extend runtime diagnostics only as needed to expose measurements already present in the worklet.
- Store captured JSON under `docs/reports/`; reports are evidence outputs, not implementation authority.

### Required evidence schema

```js
{
  schema: 'kessho-mobile-web-audio-evidence-v1',
  device: { model: 'iPhone 11', os: '...', browser: 'safari|chrome|home-screen' },
  scenario: { presetId: '...', output: 'speaker|wired|bluetooth', lockedMinutes: 60 },
  before: {
    renderCpuMean: 0,
    renderCpuPeak: 0,
    renderP95Ms: 0,
    renderP99Ms: 0,
    missedQuantumCount: 0,
    assetMissingCount: 0,
    wasmHeapBytes: 0,
    decodedAssetBytes: 0,
    assetAllocationBytes: 0,
    hostDecodedBytes: 0,
    inFlightDecodedBytes: 0,
    audibleGapCount: 0
  }
}
```

Add `hostDecodedBytes` and `inFlightDecodedBytes` to runtime diagnostics. Keep only counters and a fixed-size sample ring; never retain decoded arrays for measurement.

### Baseline scenarios

1. Default preset, screen visible, 15 minutes.
2. Highest measured CPU preset, screen visible, 15 minutes.
3. Highest decoded-memory preset, screen visible, 15 minutes.
4. Ten cycles through representative piano/sample/soundscape presets.
5. Safari, Chrome, and Home Screen with the screen locked for 60 minutes.
6. Internal speaker, one wired route if available, and one Bluetooth route.

### Commands

```bash
npm run type-check
npm run core:product:asset-manifest
npm run core:product:cpu
npm run core:product:cpu-repeatability
npm run core:product:sampler-cpu
npm run core:product:background-audio
```

### Success criteria

- The evidence checker rejects missing fields, non-finite values, wrong device/browser labels, and runs shorter than the required duration.
- A baseline exists for iPhone 11 and one current iPhone before phase 9 is accepted.
- Repeating the same desktop CPU scenario three times has less than 5% spread in mean render CPU. If not, fix the benchmark before optimization work.

## Phase 1: Give the Product Worklet One Source of Truth

The public Product worklet is currently both a behavior source and a generated binding output. Fix that before adding release state machines.

### Files

- Add `cpp/KesshoCore/adapters/wasm/kessho-core-product.worklet.js` from the current public worklet.
- Change `scripts/generate-kessho-product-bindings.mjs` to read that source and write `public/worklets/kessho-core-product.worklet.js` after replacing generated schema/event sections.
- Update `scripts/check-generated-files-clean.mjs` and `scripts/check-kessho-product-web-host.mjs` to verify regeneration.

### Generator pattern

```js
const productWorkletSourcePath = resolve(
  root,
  'cpp/KesshoCore/adapters/wasm/kessho-core-product.worklet.js',
);
const productWorkletOutputPath = resolve(
  root,
  'public/worklets/kessho-core-product.worklet.js',
);

const source = readFileSync(productWorkletSourcePath, 'utf8');
const generated = applyProductBindings(source, schemaHashLiteral, events);
writeGenerated(productWorkletOutputPath, generated);
```

Do not write generated values back into the source adapter. The source adapter owns behavior; the generator owns the public artifact.

### Commands

```bash
npm run core:product:generate
node scripts/check-generated-files-clean.mjs
npm run core:product:wasm
npm run core:product:web-host
git diff --check
```

### Success criteria

- Deleting and regenerating the public Product worklet produces the tracked file byte-for-byte.
- A behavior-only edit to the adapter appears in the regenerated public worklet.
- A schema/event generation run changes only generated sections plus the public artifact.

## Phase 2: Move Full Telemetry off Every Render Block

### Required design

Split telemetry into:

- Real-time counters: values that must be incremented at the point of an event, such as missing assets, queue overflow, render errors, and peak accumulators.
- Snapshot refresh: scans of voices, sources, assets, granular visual state, earth texture state, modulation debug arrays, and other host-facing structures.
- Demand-driven meters: master RMS, true peak, integrated loudness, limiter reduction, and similar values currently calculated periodically inside `applyMaster()`.

Remove `updateTelemetry(frames)` from the end of every `render()` call. Refresh the full snapshot only on demand for the web worklet and at a bounded cadence for the native diagnostics bridge.

### Files

- `cpp/KesshoCore/src/product/KesshoProductRender.cpp`
- `cpp/KesshoCore/src/product/KesshoProductTelemetry.cpp`
- `cpp/KesshoCore/src/product/KesshoProductApi.cpp`
- `cpp/KesshoCore/src/product/ProductState.h`
- `cpp/KesshoCore/include/KesshoCore/KesshoProductCore.h`
- `cpp/KesshoCore/src/product/native/KesshoNativeProductRuntime.cpp`
- Product worklet source from phase 1
- `scripts/kessho-core-build-manifest.mjs`
- CPU, ABI, telemetry, and deterministic render tests

### C++ contract

```cpp
// Cheap and safe to call from render(). No scans and no large array copies.
void KesshoProductEngine::finishRealtimeTelemetryBlock(uint32_t frames) {
  telemetry.block_size = frames;
  telemetry.absolute_sample_time = transport.sample_frame;
  telemetry.control_queue_depth = control_event_count;
}

// Called when a host asks for a complete diagnostic snapshot.
int32_t kessho_product_refresh_telemetry(KesshoProductEngine* engine) {
  if (engine == nullptr) return KESSHO_PRODUCT_ERROR_INVALID_ENGINE;
  engine->updateTelemetry(0);
  return KESSHO_PRODUCT_OK;
}
```

The worklet must call `refreshTelemetry()` immediately before `copyTelemetry()` in `readTelemetry()` and `readVisualTelemetry()`. The native runtime must refresh and publish no more often than every 16 render blocks unless an explicit diagnostic request is pending.

Add a meter-demand flag. Expensive master meter calculations must run only while a visible telemetry consumer, graph capture, or explicit diagnostics capture requests them. Limiting and master gain remain unconditional; only measurement math is gated. Reset meter accumulators when demand changes from false to true so old values are not published as current.

Do not move telemetry refresh to a JavaScript interval inside `process()`. A host request message is the trigger.

### Tests to add

1. Rendering 1,000 blocks without a telemetry request performs zero full telemetry refreshes. Add a test-only refresh counter if needed.
2. Missing-asset and queue-error counters remain correct without a full refresh.
3. A telemetry request after rendering returns current transport, active voices, active assets, and visual state.
4. PCM output is byte-identical before and after this phase for deterministic fixtures.
5. Native telemetry publication remains race-free and no more frequent than the configured block cadence.

### Commands

```bash
npm run core:product:abi
npm run core:product:determinism
npm run core:product:cpu
npm run core:product:sampler-cpu
npm run core:product:realtime-safety
npm run core:product:web-host
```

### Success criteria

- Production playback with telemetry disabled performs no full telemetry scan.
- Normal visible telemetry remains within one configured host polling interval of current state.
- Deterministic PCM fixtures are byte-identical.
- Mean render CPU improves by at least 2% relative in the full Product Core CPU scenario, or profiling proves the removed scan was below 2%; p95 and p99 must not regress by more than 3%.

## Phase 3: Make Stems and Stem Metering Opt-In

### Required design

Add an engine flag separate from graph-tap mode. Capture stems only when one of these is true:

1. DAW/multichannel routing needs them.
2. A graph capture uses a stem-backed tap.
3. An explicit visible diagnostic stem-meter request is active.

Normal stereo playback must not clear, accumulate, copy, or scan stem buffers.

### Core pattern

```cpp
bool KesshoProductEngine::captureStems() const {
  return stems_enabled || graph_taps_enabled;
}

if (captureStems()) {
  clearStemOutput(stem_frames);
}

if (captureStems() && voice.source_id < kStemCount) {
  stem_l[voice.source_id][frame] += left;
  stem_r[voice.source_id][frame] += right;
}
```

Apply the condition to every stem write in Product Core, including source mixes, sample voices, FX, drum, soundscape, and master. Do not condition audio buses that feed the master output.

Add `kessho_product_set_stems_enabled(engine, enabled)` and export it. Worklet stem metering must default to false. `CoreProductRuntime.setVisualTelemetryActive()` may enable visible metering only when a real consumer exists; visibility changes must disable it while hidden.

### Tests to add

1. With stems disabled, master PCM matches the current fixture exactly and stem buffers are not written.
2. With stems enabled, every existing graph/stem test remains unchanged.
3. DAW output routing automatically enables required capture and disables it when the final route/capture stops.
4. Hidden visibility disables diagnostic metering without disabling master audio.

### Commands

```bash
npm run core:product:graph
npm run core:product:web-graph-capture-smoke:fast
npm run core:product:cpu
npm run core:product:module-cpu
npm run core:product:web-host
```

### Success criteria

- No stem clear, write, copy, or peak scan occurs in normal stereo playback.
- DAW and graph capture output remains correct when explicitly enabled.
- Master PCM is byte-identical with stems off versus the pre-phase master output.
- Mean normal-stereo CPU improves by at least 2% relative, or profiling demonstrates less than 2% available; combined phases 2-3 must not regress any CPU percentile.

## Phase 4: Implement Safe Deferred Asset Release

This phase is mandatory before any WASM asset eviction.

### C++ changes

Add a result code and an active-use check:

```cpp
typedef enum KesshoProductResult {
  // Existing values remain unchanged.
  KESSHO_PRODUCT_ERROR_ASSET_IN_USE = -16
} KesshoProductResult;

bool KesshoProductEngine::assetHasActiveVoice(uint32_t asset_id) const {
  const uint32_t slot = findAssetSlot(asset_id);
  if (slot == kessho::product::generated::KESSHO_PRODUCT_MAX_ASSETS) return false;
  for (const Voice& voice : voices) {
    if (voice.active && voice.sample_voice && voice.asset_slot == slot) return true;
  }
  return false;
}
```

`kessho_product_unregister_asset_buffer()` must return `KESSHO_PRODUCT_ERROR_ASSET_IN_USE` without mutating the slot when any active voice references it.

### Worklet release state machine

```js
requestAssetRelease(assetId) {
  if (this.assetAllocations.has(assetId)) {
    this.pendingAssetReleases.add(assetId);
  } else {
    this.port.postMessage({ type: 'asset-release-complete', assetId });
  }
}

retryPendingAssetReleases() {
  for (const assetId of this.pendingAssetReleases) {
    const result = this.api.unregisterAsset(this.engine, assetId);
    if (result === PRODUCT_ERROR_ASSET_IN_USE) continue;
    if (result !== PRODUCT_OK) {
      this.port.postMessage({ type: 'asset-release-failed', assetId, result });
      this.pendingAssetReleases.delete(assetId);
      continue;
    }
    this.freeAssetAllocation(assetId);
    this.pendingAssetReleases.delete(assetId);
    this.port.postMessage({ type: 'asset-release-complete', assetId });
  }
}
```

Retry once after each render block. Only `freeAssetAllocation()` may call WASM `free()` for asset channel pointers.

Delete the current duplicate-registration replacement behavior that unregisters and frees the old allocation immediately. A duplicate registration must be rejected until release completes. Re-registration is a host sequence: release request, completion acknowledgement, then register.

### Runtime and registrar contract

```ts
type CoreProductAssetReleaseMessage =
  | { type: 'asset-release-complete'; assetId: number }
  | { type: 'asset-release-failed'; assetId: number; result: number };

requestAssetRelease(assetId: number): void;
setAssetReleaseCallback(callback: ((assetId: number) => void) | null): void;
```

`CoreProductAssetRegistrar` needs three sets: `registeredAssetIds`, `pendingReleaseAssetIds`, and `requiredAssetIds`. Remove an ID and its byte count from registered state only after `asset-release-complete`.

### Tests to add

1. C++ unregister of an active one-shot voice returns `ASSET_IN_USE` and audio continues.
2. C++ unregister succeeds after that voice ends.
3. C++ unregister of an active loop remains deferred until the source releases the loop.
4. Worklet pointers remain allocated after `ASSET_IN_USE` and are freed exactly once after success.
5. Duplicate registration cannot free an active allocation.
6. Registrar byte accounting changes only on completion acknowledgement.

### Commands

```bash
npm run core:product:assets
npm run core:product:abi
npm run core:product:wasm
npm run core:product:web-host
npm run core:product:realtime-safety
```

### Success criteria

- No code path frees an asset pointer before Product Core confirms release.
- An eviction request never truncates an active voice.
- Release acknowledgement and byte accounting are exactly once.
- Repeating register/release 1,000 times produces no allocation-count drift after voices finish.

## Phase 5: Bound Mobile Asset Memory and Remove the Transfer Clone

### Budget policy

Add a pure `CoreProductAssetWorkingSet` policy class. Keep policy separate from decoding and runtime messaging.

Initial evidence candidates, not permanent device claims:

```ts
const MiB = 1024 * 1024;

export const MOBILE_PRODUCT_ASSET_BUDGET = Object.freeze({
  registeredSoftBytes: 160 * MiB,
  registeredHardBytes: 192 * MiB,
  hostDecodedBytes: 16 * MiB,
  maxConcurrentDecodes: 1,
});
```

The phase 9 device gate may lower these values. Raising them requires new iPhone 11 lock/thermal evidence.

Before decoding, reserve the manifest's conservative maximum for that asset class: 128 MiB for a soundscape and 4 MiB for a piano asset. Request release of least-recently-required, non-required registrations until the reservation fits. Correct the reservation to actual bytes after decode.

If the required current working set cannot fit the hard budget, return a typed `not-ready` result. Do not silently swap samples, lower quality, or start additional decoding.

### Transfer ownership

Change runtime registration to make ownership explicit:

```ts
type AssetTransferOwnership = 'retain-host-copy' | 'transfer';

registerAsset(
  asset: DecodedCoreProductAsset,
  ownership: AssetTransferOwnership,
): void {
  const payload = ownership === 'retain-host-copy'
    ? cloneDecodedCoreProductAssetForTransfer(asset)
    : asset;
  this.requireNode('registerAsset').port.postMessage(
    { type: 'register-asset', ...payload },
    payload.channels.map((channel) => channel.buffer),
  );
}
```

Policy:

- Mobile: WASM owns the retained decoded copy. Remove/take the host cache entry, then transfer the original arrays. Never retain detached arrays.
- Desktop: keep the current host-cache copy initially and use `retain-host-copy`.
- Soundscapes: transfer ownership directly on all mobile paths.
- Decode and register only one mobile asset at a time.

Add `take(assetId)` to `SampleDecodedAssetCache` to remove and return an entry while fixing its byte accounting. Do not use `clear()` to transfer one entry.

### Working-set behavior

1. Recompute required IDs after every committed Product state revision.
2. Mark current required IDs before loading anything.
3. Request release of obsolete registered IDs until under the soft budget.
4. Let Product Core defer IDs still used by active voices.
5. Serialize reserve, decode, transfer, and registration acknowledgement.
6. Do not begin a fetch or decode while the document is hidden.
7. `wasmHeapBytes` may remain at its high-water mark; use active allocation bytes and stable repeated-cycle high water as the leak criteria.

### Tests to add

1. `take()` returns ownership, removes cache bytes, and leaves no detached cached array.
2. Mobile registration performs no `cloneDecodedCoreProductAssetForTransfer()` call.
3. Desktop registration retains current cache semantics.
4. Ten preset cycles stabilize `assetAllocationBytes`; the second cycle does not increase the warmed WASM heap high-water mark.
5. Hard-budget admission rejects before starting an over-budget decode.
6. Only one mobile decode is in flight.
7. A hidden document starts zero new fetch/decode operations.

### Commands

```bash
node scripts/run-sample-library-tests.mjs
npm run core:product:asset-manifest
npm run core:product:assets
npm run core:product:sampler-cpu
npm run core:product:web-host
npm run type-check
```

### Success criteria

- Mobile normal operation remains at or below 160 MiB registered decoded assets after deferred releases complete.
- Mobile never admits more than 192 MiB registered decoded assets.
- The host decoded cache is at or below 16 MiB and detached buffers are never retained.
- Registration no longer creates a full transfer clone on mobile.
- Repeated preset cycling has a stable warmed heap high-water mark and no active-allocation growth.
- No audio cutoff occurs during eviction.

## Phase 6: Integrate iOS Audio Session and Preserve User Activation

### Files

- Add `src/audio/product/browser/ProductBrowserAudioSession.ts` as a feature-detected wrapper.
- Update `src/audio/coreProductRuntime.ts`.
- Update `src/ui/audioEngineMediaSession.ts` without changing the reference-runtime behavior.
- Update `src/ui/useProductRuntimeBackgroundAudioSupport.ts`.
- Add browser-session lifecycle tests with fake `navigator.audioSession`, Media Session, AudioContext, and HTML audio objects.

`ProductBrowserAudioSession` is for a real browser only. When `isCapacitorNativeShell()` is true, `plugins/kessho-capacitor-audio-session` and its `IOSAudioSessionCoordinator` remain the sole `AVAudioSession` owner. Do not set browser `audioSession.type` inside the installed shell. Carrier activation may still be used for the WebAudio sink, but native category, interruption, and route policy must not have a second owner.

### Audio Session wrapper

```ts
import { isCapacitorNativeShell } from '../../../native/capacitorAudioSession';

type BrowserAudioSession = EventTarget & {
  type: 'auto' | 'playback';
  state?: 'inactive' | 'active' | 'interrupted';
};

export function setBrowserPlaybackSession(active: boolean): void {
  if (typeof navigator === 'undefined' || isCapacitorNativeShell()) return;
  const session = (navigator as Navigator & {
    audioSession?: BrowserAudioSession;
  }).audioSession;
  if (!session) return;
  session.type = active ? 'playback' : 'auto';
}
```

Feature detection is the only selection rule. Do not branch on Safari versus Chrome.

### Preserve the gesture

Move iOS destination/carrier setup before the first asynchronous wait in runtime initialization. During a direct play gesture:

```ts
resumeFromUserGesture(): Promise<void> {
  const started = this.ensureStarted(); // Creates context/carrier synchronously before first await.
  const contextResume = this.context?.resume();
  const carrierPlay = this.mediaSessionAudio?.play();
  setBrowserPlaybackSession(true);
  return Promise.allSettled([started, contextResume, carrierPlay]).then(() => undefined);
}
```

The actual implementation must surface a failed `ensureStarted()`; do not let `allSettled()` swallow runtime initialization failure. Carrier failure remains best effort and is diagnostic only.

Use one monotonically increasing playback revision to ignore late resume/pause promises. A pause or stop with a newer revision must win over an older unresolved play.

### Interruption rules

- `active -> interrupted`: record state; do not spin a resume loop.
- `interrupted -> active`: resume once if the latest requested playback state is playing.
- Media Session play: increment revision and perform one resume.
- Media Session pause/stop: increment revision, suspend/stop, and set playback state.
- Normal stop/dispose: set Audio Session type back to `auto`, pause carrier, clear `srcObject` on dispose.

### Success criteria

- `audioSession.type` is `playback` only while playback is requested and supported.
- Unsupported browsers follow the existing path without exceptions.
- `AudioContext.resume()` and carrier `play()` are invoked in the synchronous user-gesture turn.
- Late promises cannot restart audio after pause/stop.
- One interruption produces at most one automatic resume attempt.
- Existing Media Session lock-screen controls continue to work.

## Phase 7: Add Explicit Hidden Audio-Only Host Mode

### Scheduler behavior

When hidden, UI channels retain only one dirty bit. They do not create timers and do not invoke callbacks. On foreground, flush each dirty channel once from current authoritative state.

```ts
markDirty(channel: ProductFrameChannel): void {
  if (this.disposed) return;
  this.dirty.add(channel);
  if (this.isHidden()) return;
  this.scheduleVisibleFlush();
}

setDocumentHidden(hidden: boolean): void {
  this.hidden = hidden;
  if (!hidden && this.dirty.size > 0) this.scheduleVisibleFlush();
}
```

Remove production hidden timers for:

- visuals
- telemetry publication
- diagnostics
- MIDI activity UI
- performance overlay
- sample cache/miss/decode UI
- sample voice visualization

Minimal worklet health counters remain internal and are read once on foreground. Do not publish them to React while hidden.

### Runtime background message

Add a single idempotent worklet message:

```ts
this.node?.port.postMessage({
  type: 'host-visibility',
  hidden: document.visibilityState === 'hidden',
});
```

On hidden, the worklet disables perf timing, stem metering, graph diagnostics without an active capture, and unsolicited messages. It must not suspend the audio context or stop Product Core rendering.

### Tests to change

Replace existing tests that expect hidden timers. New assertions:

1. Hidden dirty bursts schedule zero timers and zero animation frames.
2. Hidden dirty bursts invoke zero callbacks.
3. Foreground transition invokes one callback per dirty channel using current state.
4. Audio render calls continue while host visibility is hidden.
5. Debug-only behavior is opt-in and cannot enter production bundles.

### Commands

```bash
npm run test:product-diagnostics-scheduler
npm run test:product-runtime-lifecycle
npm run core:product:web-host
npm run core:product:background-audio
npm run type-check
```

### Success criteria

- A 10-minute hidden simulation executes zero UI/diagnostic callbacks and creates zero hidden UI timers.
- Foreground produces one consolidated refresh, not a backlog replay.
- Product Core audio output and internal sample-frame transport continue uninterrupted.
- Visible UI behavior remains unchanged.

## Phase 8: Move Arrangement Timing to Sample Frames

This is the phase that removes the browser main thread from ongoing musical timing. Implement it in four subphases; run the gate after each subphase.

### 8A: Replace delayed-note timers with queued sample offsets

`KesshoProductEvent.sampleOffset` already supports a 32-bit future frame offset, and Product Core carries future events across render blocks. Use it.

```ts
private postScheduledNote(delaySeconds: number, event: CoreProductEvent): void {
  const sampleRate = this.audioContext()?.sampleRate ?? 48_000;
  this.postEvent({
    ...event,
    sampleOffset: Math.max(0, Math.round(delaySeconds * sampleRate)),
  });
}
```

Do not post until required sample assets for the complete phrase are registered. Remove `padNoteTimers` and `leadNoteTimers` only after parity tests pass.

Success: zero per-note `setTimeout()` calls, event order unchanged, and target offset differs by no more than one sample in deterministic tests.

### 8B: Move harmony clock boundaries into Product Core

Add snapshot-owned state for next harmony frame, chord sub-tick, progression phrase index, and RNG state. Generate harmony transitions from `transport.sample_frame`, not wall time.

Use fixed-size POD state. Do not allocate, lock, parse JSON, or call host code from `render()`.

Success: a 60-minute offline render has the same harmony event sequence as the deterministic TypeScript reference and zero wall-clock dependency.

### 8C: Move chord generator and chord sequencer scheduling

Port one generator at a time. Keep the TypeScript implementation behind a development-only parity harness, never a production fallback. Compare generated events before deleting each TypeScript owner.

Required event comparison fields:

- event kind
- source/target
- MIDI note
- velocity within `1e-6`
- hold time within `1e-6`
- sample offset within one sample
- RNG state after generation

Success: event streams pass, PCM correlation is at least 0.9999, and loudness delta is less than 0.1 dB for the fixed corpus.

### 8D: Move random lead phrase generation and delete host timers

Port lead phrase count, note choice, chord weighting, velocity, octave/range policy, and phrase reseed state. Then remove these production timer owners from `CoreProductArrangementScheduler`:

- `harmonyTimer`
- `leadPhraseTimer`
- `chordSequencerTimer`
- delayed note timer sets

Keep only host-side visualization projection and user-control translation.

### Background asset closure

Before entering hidden mode, maintain a foreground-built closure containing:

- all IDs required by current state
- all IDs required by the committed next phrase
- pending registration IDs
- registered decoded bytes
- readiness revision

Once hidden, Product Core may schedule only committed asset IDs. No fetch or decode is allowed. If closure readiness is false, continue already-registered audio and report `not-ready`; do not silently substitute a different sound.

### Native MIDI architecture

Keep all new scheduling APIs expressed as Product Core events plus sample offsets. Future native MIDI adapters must convert host timestamps to a target Product Core sample frame and enqueue through the same event queue. Do not add a WebAudio-specific timing object to Product Core snapshots.

### Commands after each subphase

```bash
npm run core:product:harmony
npm run core:product:determinism
npm run core:product:snapshot-regression
npm run core:product:sequencer
npm run core:product:realtime-safety
npm run core:product:cpu
```

### Phase success criteria

- Production arrangement timing contains no `setTimeout()` or `setInterval()` owner.
- A hidden-main-thread simulation continues generating valid audio for 60 minutes.
- No missing-asset counter increase occurs while hidden.
- Deterministic event/RNG fixtures pass for each migrated generator.
- CPU mean does not regress more than 3%; p99 render time and missed quantum count must improve or remain unchanged.

## Phase 9: Physical-Device Acceptance

Static source checks and simulator runs are prerequisites, not acceptance evidence.

### Required matrix

| Device | Surface | State | Duration |
| --- | --- | --- | --- |
| iPhone 11 | Safari tab | visible, app switch, screen lock | 60 minutes each |
| iPhone 11 | Chrome tab | visible, app switch, screen lock | 60 minutes each |
| iPhone 11 | Home Screen install | visible, app switch, screen lock | 60 minutes each |
| Current iPhone | Same three surfaces | Same states | 60 minutes each |

Repeat the lock run for internal speaker and Bluetooth. Exercise pause/play from lock screen and one interruption such as an incoming-call simulation.

### Hard acceptance gates

- No process termination during any required run.
- No missed render quantum increase during stable locked playback.
- No audible gaps longer than 20 ms; no repeated gap pattern.
- No missing-asset count increase while hidden.
- `decodedAssetBytes <= 192 MiB` at all times and returns under the soft budget after deferred releases.
- `assetAllocationBytes` stabilizes after warm preset cycling.
- The warmed `wasmHeapBytes` high-water mark does not rise on a second identical cycle.
- Hidden UI callback count is zero.
- Foreground restoration produces one state refresh and no burst of stale events.
- Foreground versus hidden output for a fixed deterministic scenario meets correlation `>= 0.9999` and loudness delta `< 0.1 dB`.
- iPhone 11 thermal state does not cause sustained dropouts in the 60-minute highest-CPU scenario.

Safari or Chrome may still be suspended by browser/OS policy. If that happens after all code gates pass, record the surface as best-effort failure; do not add busy-loop workarounds. Home Screen and the installed app remain the stronger delivery surfaces.

### Full milestone commands

```bash
npm run core:product:generate
node scripts/check-generated-files-clean.mjs
npm run type-check
npm run core:product:ci:prereqs
npm run core:product:cpu-scenarios
npm run core:product:cpu-repeatability
npm run core:product:background-audio
npm run core:product:mobile-web-evidence:acceptance
npm run build
```

## Phase 10: Native Apple Routing and MIDI

Start this only after phase 9, because otherwise native work can hide shared Product Core regressions and split optimization effort across two audio paths.

### Native audio route

1. Keep the web UI as the control surface.
2. Send snapshots and batched Product Core events through the native bridge.
3. Render Product Core directly from the platform audio callback.
4. Use the same decoded-asset working-set and deferred-release contracts.
5. Switch routes only at a controlled stop/start boundary; do not run WebAudio and native master output simultaneously.
6. Keep a development-only parity comparison, not a production fallback.

### Native MIDI route

1. Timestamp MIDI at receipt.
2. Convert host time to Product Core sample frame using the active native audio clock.
3. Enqueue the same `KesshoProductEvent` ABI used by WASM.
4. Preserve event order with a bounded lock-free queue.
5. Measure input-to-render latency and jitter separately from UI message latency.

### Native success criteria

- Native and WASM deterministic renders meet the phase 9 sonic thresholds.
- No allocation, lock, Objective-C dispatch, file I/O, or logging occurs in the native render callback.
- Native routing lowers measured app audio CPU by at least 5% relative or is not enabled by default.
- Native MIDI p95 scheduling jitter is below one render quantum.
- Interruptions, route changes, Bluetooth, wired output, and media-services reset recover without duplicate playback.

## Global Stop Conditions

Stop the current phase and fix it before continuing when any of these occurs:

- Deterministic PCM changes during phases 2-5.
- An asset pointer is freed without a Product Core release acknowledgement.
- A hidden path starts a network request, decode, UI timer, visualization callback, or telemetry publication.
- A memory budget is raised to make a test pass.
- A quality setting is lowered to make a CPU test pass.
- A production fallback reintroduces the TypeScript arrangement scheduler after phase 8.
- A simulator or static token check is presented as physical-device proof.

## Definition of Done

The undertaking is complete only when:

1. Phases 0-9 pass and physical evidence is recorded for both required iPhone generations.
2. Shared Product Core CPU is lower with unchanged deterministic master output.
3. Mobile decoded allocations remain bounded across repeated state changes.
4. Hidden playback performs audio rendering and minimal interruption bookkeeping only.
5. Ongoing musical timing is owned by Product Core sample frames, not the browser main thread.
6. Browser failures caused by OS suspension are explicitly recorded instead of hidden by unsupported workarounds.
7. Native Apple routing remains a separate, measurable phase and uses the same Product Core state/event/asset contracts.
