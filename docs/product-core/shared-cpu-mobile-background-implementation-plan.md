# Shared Product Core CPU and Mobile Background Implementation Plan

## Purpose

This plan is an implementation script for an engineer who should not need to make architectural decisions while coding.

Primary goals:

1. Reduce Product Core render CPU for the web app and the current iOS/macOS WebView apps.
2. Bound decoded-audio memory and asset-load spikes on mobile.
3. Make iOS Safari and Chrome background playback use audio-only work as far as browser policy permits.
4. Preserve the current sound. CPU work must not lower voice counts, sample quality, effects quality, or modulation rates.
5. Leave a sample-frame scheduling contract that native MIDI can use later.
6. Keep every autonomous sonic feature advancing when the host UI thread is suspended, provided the audio render callback continues.

Native Apple audio routing is intentionally last. The current Apple apps use the same WebAudio/WASM Product Core path as the browser, so phases 0-9 benefit all three current products. Native routing is not required to implement or measure those phases.

## Implementation Status (2026-07-18)

Shared Product Core phases 0-8L are complete in software. The remaining advanced-milestone work is physical iPhone acceptance: browser-policy behavior, thermal stability, memory pressure, and audible output still require the phase 9 device matrix.

| Phase | Status | Evidence summary |
| --- | --- | --- |
| 0 | Software complete; device baselines pending | Evidence schemas, recorders, validators, CPU reports, and memory reports are implemented. Required physical iPhone baselines remain part of phase 9 acceptance. |
| 1 | Complete | The adapter worklet is authoritative and generated output is deterministic. |
| 2 | Complete | Telemetry and meters are demand-driven; normal rendering performs no full telemetry scan. |
| 3 | Complete | Stem capture and metering are opt-in and disabled for normal stereo playback. |
| 4 | Complete | Asset release is deferred until Product Core acknowledges that no active voice uses the allocation. |
| 5 | Complete | Mobile asset admission, serialized decoding, transfer ownership, cache take/release, allocation accounting, and explicit background asset closure are bounded. Required prediction is uncapped unless a caller explicitly requests a cap. |
| 6 | Complete in software | Browser audio-session ownership, gesture-preserving carrier activation, interruption handling, and native-shell exclusion pass automated checks. |
| 7 | Complete in software | Hidden UI/diagnostic scheduling is suppressed while Product Core audio rendering continues. Sonic autonomy for the previously host-owned features is delivered by phases 8E-8L. |
| 8A-8D | Complete | Arrangement, harmony, chord, lead, sequencer-chain, and scheduled-evolve timing are Product Core-owned and advance from sample frames. |
| 8E | Complete in software | The five-minute bounded autonomy harness and ownership gate pass for completed phases. |
| 8F | Complete in software | Source auto-morph and Product Core auto-stop are production-wired and pass targeted tests. |
| 8G | Complete in software | Product Core arp flow and harmony resolution are production-wired. Oversized test fixtures were moved off the process stack and the full sequencer/harmony tests pass. |
| 8H | Complete in software | Product Core Scatter is production-wired; targeted endurance and CPU scenarios pass with zero missed quanta. |
| 8I | Complete in software | The bounded scene ABI, measured capacities, categorical interpolation, soundscape assets/params, malformed-commit handling, seven-position production oracle, and CPU scenario pass. Auto-Cycle is the first production caller. |
| 8J | Complete in software | Product Core owns all eight slots, all 16 routing rows, independent sequencer booleans, deterministic selection, sample fades, and Product-mode telemetry. Targeted foreground/suspended PCM and RNG tests pass. |
| 8K | Complete in software | Product Core owns Hold, Entry, PlayA, MorphAB, PlayB, and MorphBA from sample frames. Endpoint assets are prepared as one closure, Product-mode UI is telemetry-only, live phrase-duration changes apply at the next phase without restarting the current phase, 1,000 suspended-host transitions pass, and the maximum-scene CPU case remains within five percent of baseline. |
| 8L | Complete in software | The visible host deterministically compiles and admits a bounded two-hour/512-entry route, uploads deduplicated scene programs atomically, and Product Core executes hold/morph/loop timing from sample frames. Exact asset prediction, 160/192/16 MiB gates, typed fallback, confirmed subset optimization, readiness UI, telemetry, suspended-host parity, and a matched CPU gate are implemented. |
| 9 | Base and advanced collectors ready; physical runs pending | The opt-in `?mobileEvidence=1` collector derives Product CPU, memory, asset, autonomy, hidden-callback, reconciliation, Auto-Stop, and Journey evidence without hidden polling or PCM buffering. The v2 validator has separate base and advanced gates and ties declared hidden duration to sample rate and Product Core frame deltas. No physical captures exist yet. |
| 10 | Not started | Must remain blocked until phase 9 passes. |

Latest Product Core CPU repeatability evidence: disabled effects `4.85700%` median mean with `0.450%` spread, active effects `8.09904%` median mean with `1.344%` spread, and zero missed render quanta across all three runs. The sampler loop-boundary stress case measured `4.33535%` mean / `4.71563%` peak with zero missed quanta.

Latest phase 8K CPU evidence: disabled effects `4.84060%` mean and maximum Product Auto-Cycle `4.79798%` mean, both with zero missed render quanta. The difference is measurement noise rather than an expected speedup; the result establishes that Auto-Cycle adds no material render-thread CPU cost.

Post-8L integration evidence: the production build, ABI/WASM smoke, web-host boundary, real-time safety, background-audio support, determinism, sequencer/harmony regressions, and complete 8E-8L sonic-autonomy gate pass. The Journey coordinator is isolated from the central host, the two schedule banks are allocated only at engine construction rather than inflating stack-allocated engine objects, and schedule uploads use in-place reset without large WASM stack temporaries. The advanced evidence collector reports Journey readiness, duration, entry count, asset bytes, and transition count. The completed ownership command runs without `--expect-incomplete` and rejects any return to host-owned sonic timing.

Latest phase 8L CPU evidence: disabled effects measured `4.78472%` mean and the maximum supported Product Journey fixture measured `4.82120%` mean, approximately `0.76%` relative overhead, with zero missed render quanta. Journey scene application uses the same 101-position contract as the phase 8I scene runtime and integer sample-frame thresholds, avoiding per-block full-program application. Background plans reject morph durations below the supported legacy half-phrase floor; the current editor minimum is one phrase.

Post-completion CPU audit: source morph now has an executable three-percent relative mean-CPU assertion against the mean of bracketing disabled-feature baselines, avoiding false comparisons across CPU-frequency transitions without weakening the limit. Its disabled path exits through an enabled-target mask, and Random mode hashes once at each completed-cycle boundary instead of recomputing the same value every render block. Scatter scheduling scans only the phrase steps that can intersect the current render block, and a matched scheduler-only fixture enforces the three-percent limit without conflating scheduler cost with additional drum-voice rendering. Routing mute groups retain a non-unity row mask, so idle playback bypasses fade interpolation with one bit test and returns to that fast path after unmute completion. The three-run CPU repeatability gate and real-time safety scan pass after these changes.

Post-completion acceptance audit: the Product CPU suite permits zero missed quanta rather than the previous two-miss allowance. Source morph and Auto-Stop now have feature-enabled foreground-versus-suspended PCM/state traces rather than relying on the baseline sequencer parity fixture; Auto-Stop also proves the same exact in-block target frame at 44.1, 48, and 96 kHz. Random Live has its own audible foreground-versus-suspended trace covering PCM, resolved-note progression, RNG cursor, audible-MIDI telemetry, and a different-seed control; the full sequencer suite separately enforces all six arp flows, contour and boundary modes, reset masks, source-slot locking, rates, and Dice Hold retention. Scatter now has an explicitly drum-enabled audible parity trace covering PCM, phrase/step/pulse progression, selector RNG, per-voice RNG, telemetry agreement, and a different-seed control in addition to its five-minute queue-starvation fixture and exact sample-offset oracle. The scene runtime renders a sustained deterministic pad through complete forward and reverse transitions against a direct-state oracle and enforces correlation `>= 0.9999` plus loudness delta `< 0.1 dB`. Routing mute groups now run their TypeScript compiler tests in the standard gate, while the paired native fixture explicitly traverses both eligible slots, fade-down, muted hold, and fade-up and requires exact foreground-versus-suspended PCM, slot, and RNG agreement. Auto-Cycle explicitly proves sample-exact MorphBA and return to endpoint A, observes all six phases in the paired run, and requires exact foreground-versus-suspended PCM, phase state, and demand-driven telemetry. `core:product:sonic-autonomy` executes those compiler tests, the dedicated native Scatter and scene-program suites, and the combined suspended-host harness, so these criteria are part of the standard milestone gate rather than manually invoked tests.

Corrective Journey audit closure: asynchronous preparation and optimization now use generation plus configuration-fingerprint guards at every await boundary, so stale work cannot publish readiness or install a superseded schedule. The coordinator exposes `discard()` separately from normal playback stop and clears retained scene assets on cancellation, admission failure, stale completion, and foreground-only fallback. Typed asset failures preserve hard-budget, required-byte, and limit-byte diagnostics. Scene and Journey event staging rejects non-finite endpoints and command values before they reach DSP state. The suspended-host Journey test compares audible PCM, schedule/phase state, transition progress, and RNG state while foreground-only telemetry polling remains absent from the suspended run. The maximum 512-entry, 20-program upload is measured while rendering; the latest run took `0.147 ms` of a `2.667 ms` quantum with zero misses. Journey mean CPU now uses the mean of bracketing matched baselines, preventing CPU-frequency transitions from being misclassified as feature overhead while retaining the independent p99 and zero-miss gates; the isolated three-run repeatability check passed with `0.464%` disabled and `0.772%` active spread. The browser ARP proof now waits for authoritative host reconciliation and uses an explicit source, lane audibility, and trigger-mask fixture before verifying that a pending pattern becomes audible before the next parent trigger.

Latest complete software gate: `core:product:ci:prereqs` passed all 57 steps with zero failures. The measured Product browser case used `32.066%` CPU versus `49.812%` for the reference runtime, a `35.63%` reduction in that run. Page comparisons were lower for Global, Synth, Drums, Granular, Delay, Reverb, Texture, and Routing; Earth was effectively neutral at `0.30%` lower. These workstation measurements are regression evidence, not substitutes for phase 9 iPhone thermal, memory-pressure, lock-screen, and browser-policy captures.

Current validation scope is Product Core. Reference `web-ts` runtime cases are not part of this milestone's remaining work; deterministic offline reference fixtures may still be used to prove Product Core output and event parity.

The current requirement-to-evidence audit is recorded in `docs/reports/shared-cpu-mobile-background-software-audit-latest.md`.

The 2026-07-17 source audit reopened the sonic-autonomy milestone. Hidden Morph/Journey polling was removed by pausing those features, but the callbacks were sound-authoritative rather than UI-only. The same audit found host-owned routing mute groups, Scatter timing, source auto-morph controls without a Product Core owner, a preview-only Random Live arp clock, and a visible-only auto-stop timer. Phases 8E-8L below supersede earlier claims that background sonic behavior was complete.

## Code-Validated Starting State

| Area | Current source behavior | Consequence |
| --- | --- | --- |
| Product telemetry | Render calls only `finishRealtimeTelemetryBlock()`; full scans and meters are demand-driven. | Completed optimization; keep it unchanged while adding telemetry fields. |
| Stems | Product Core stem capture and metering are opt-in. | Completed optimization; new runtimes must not implicitly enable stems. |
| Host telemetry | `src/audio/coreProductRuntime.ts` stops telemetry and visual polling while hidden. | This part is already correct; do not reimplement it. |
| UI scheduling | `ProductFrameScheduler` and `ProductRuntimeScheduler` now suppress hidden UI callbacks. | Infrastructure is correct, but it cannot be used to justify pausing sound-authoritative controllers. |
| Core arrangement | Harmony, chords, lead phrases, sequencer chains, and Evolve now advance from Product Core sample frames. | Keep this implementation; use it as the ownership model for phases 8E-8L. |
| Journey | `src/ui/journeyState.ts` selects graph edges and calls the actual preset morph callback from visible `requestAnimationFrame`; `CoreProductJourneyMorphClock` also stops hidden. | Journey freezes while the audio render callback can continue. The existing C++ Journey clock only modulates evolution depth. |
| Global Auto-Cycle | `src/ui/useMorphPositionRuntimeSurface.ts` calculates and commits interpolated Product states from a visible-only timer. | The audible A/B preset cycle freezes hidden. |
| Routing mute groups | `src/app/useRoutingMuteGroupSystem.ts` chooses slots with `Math.random()` and host timers; `src/ui/routing/routingMuteGroups.ts` implements fades as timer steps. | Slot changes and fades can stall or finish late when the host is suspended. |
| Scatter | `useScatterSequencerRuntime` and `useScatterPhrasePlayer` schedule selection, hits, probability, and ratchets with host timers. | Survives React tab changes but not browser/WebView suspension. |
| Source auto-morph | Pad/lead auto-morph controls are visible and classified as host/UI policy; the unused `DrumMorphManager` is the only non-reference per-drum updater. | Product Core receives manual morph values but no owner advances enabled auto-morph controls. |
| Arp flow/harmony | `arpRuntimeTick` changes only the visual preview, and the host resolves harmony-following patterns to absolute MIDI before upload. | Random Live is not live-random, and any arp that depends on evolving Product Core harmony can retain stale host-resolved notes while the host is suspended. |
| Playback timer | Auto-stop is evaluated by `useVisibleInterval`. | Playback can continue past the requested deadline while hidden. |
| Asset lifetime | Deferred release, release acknowledgement, transfer ownership, and mobile working-set policy are implemented. | Completed optimization; scene/Journey asset closure must use these contracts rather than bypassing them. |
| iOS carrier/session | Gesture-preserving carrier activation, browser Audio Session feature detection, interruption handling, and native-shell exclusion are implemented. | Completed best-effort browser integration; do not create a browser-specific second path. |
| Memory | Mobile active allocations are budgeted; a grown WASM heap remains a high-water mark and may not shrink after release. | Judge leaks by active allocations and repeated-cycle high water, not by expecting heap contraction. |
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
| 8A-8D | Sample-frame arrangement scheduling | 5, 7 | All Product Core hosts | Background-safe core arrangement |
| 8E | Sonic-autonomy harness and runtime primitives | 8D | All | Enforced ownership and deterministic clocks |
| 8F | Source auto-morph and sample-frame auto-stop | 8E | All | Small, testable first native automations |
| 8G | Product Core arp flow and harmony resolution | 8E | All | Harmony-following and live-random notes without host reposts |
| 8H | Product Core Scatter | 8E | All | Sample-accurate phrases, probability, and ratchets |
| 8I | Bounded Product scene-program compiler/runtime | 8E | All | Shared whole-preset automation substrate |
| 8J | Product Core routing mute groups | 8E | All | Deterministic slot choice and render-owned fades |
| 8K | Product Core Global Auto-Cycle | 8I | All | Hidden-safe A/B scene cycling |
| 8L | Bounded two-hour Journey schedule and asset admission | 8I, 8K | All; iPhone 11 web is the limiting profile | Hidden-safe prepared route playback and preset morphing |
| 9 | Device acceptance and rollout gate | 2-8H for base; 8L for advanced | iOS browser/current apps | Evidence on iPhone 11 and a current device for the selected milestone |
| 10 | Production native Apple routing and native MIDI queue | 9 | Installed apps | Additional app-only CPU/latency benefit |

After phase 1, phases 2-3 and phase 4 may be developed in parallel on separate branches. Merge phase 2 before phase 3. Merge phase 4 before phase 5. A single implementer should simply follow the numeric order.

### Planning effort

Phases 0-8L are historical planning estimates. Phase 9 is the remaining physical-device effort:

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
| 8B-8D | Complete |
| 8E | Complete; planned 0.5-1 engineer-day |
| 8F | Complete; planned 0.5-1 engineer-day |
| 8G | Complete; planned 1-2 engineer-days |
| 8H | Complete; planned 1-3 engineer-days |
| 8I | Complete; planned 4-7 engineer-days |
| 8J | Complete; planned 3-5 engineer-days |
| 8K | Complete; planned 1-2 engineer-days |
| 8L | Complete; planned 3-5 engineer-days |
| 9 | 1-2 device-days |
| 10 | 15-30 engineer-days |

Do not drop tests for asset lifetime, render timing, or deterministic ownership. Reduce effort through bounded feature scope and representative fixtures, not by building generalized infrastructure or running exhaustive permutations.

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
  schema: 'kessho-mobile-web-audio-evidence-v2',
  device: { model: 'iPhone 11', os: '...', browser: 'safari|chrome|home-screen' },
  scenario: {
    presetId: '...',
    output: 'speaker|wired|bluetooth',
    durationMinutes: 10,
    lockedMinutes: 3,
    appSwitchedMinutes: 0,
    bundles: ['base-autonomy']
  },
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
5. Safari, Chrome, and Home Screen with the screen locked for 10 minutes.
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

Success: a five-minute accelerated offline render has the same harmony event sequence as the deterministic TypeScript reference and zero wall-clock dependency.

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
- A hidden-main-thread simulation continues generating valid audio for five accelerated minutes.
- No missing-asset counter increase occurs while hidden.
- Deterministic event/RNG fixtures pass for each migrated generator.
- CPU mean does not regress more than 3%; p99 render time and missed quantum count must improve or remain unchanged.

## Phases 8E-8L: Complete Sonic Autonomy

These phases correct the remaining host-owned sonic behavior. Deliver them in two bounded milestones:

1. Base autonomy: 8E-8H. This guarantees source morph, auto-stop, harmony-following arp, and Scatter while the host is suspended.
2. Advanced autonomy: 8I-8L. This adds parity for routing mute groups, Auto-Cycle, and Journey only when those features are part of the release requirement.

Do not hold the base milestone for speculative scene features. A phase 9 device run may accept the base milestone first, but its evidence must state that mute groups, Auto-Cycle, and Journey are not guaranteed while the host is suspended.

### Lean delivery boundary

The goal is to reproduce current production behavior, not create a general automation language.

1. Support only controls currently emitted by the Product snapshot/diff adapters and currently used by routing mute groups, Auto-Cycle, or Journey.
2. Reject an unsupported preset or state key before playback starts. Do not generalize the ABI to support hypothetical controls.
3. Reuse existing Product parameter application and asset-readiness paths. Do not introduce a plugin system, dynamic scene registry, string-key runtime, or second scheduler.
4. Keep the existing product limits: eight mute slots, one Auto-Cycle A/B pair, and Journey's center plus four preset nodes and 20 directed edges.
5. Use accelerated deterministic tests and transition-count tests. No automated or physical endurance test in phases 8E-9 exceeds 15 minutes.
6. Test representative production presets and one maximum-control fixture. Exhaustive all-pairs preset testing is deferred unless a defect demonstrates that it is needed.
7. Sonic acceptance is correlation `>= 0.9999` and loudness delta `< 0.1 dB`; byte-identical PCM is required only for paths already expected to be exact.
8. Stop after each milestone passes. New audit findings become backlog items unless they invalidate a stated milestone guarantee.

### Required architecture

Use this ownership flow for every feature:

```text
React editor/state
    -> pure TypeScript config compiler
    -> bounded Product snapshot or Begin/Entry/Commit event upload
    -> fixed-size C++ runtime state
    -> transport.sample_frame advancement inside Product Core
    -> audio rendering
    -> bounded telemetry projection
    -> React display only
```

Ownership rules:

1. TypeScript owns editing, validation, preset lookup, asset preparation, and one-time configuration upload.
2. Product Core owns elapsed musical time, fades, morph position, probability-driven realtime triggers, ratchets, and trigger sample offsets. Phase 8L is the bounded exception for high-level Journey planning: its graph branches and random durations are resolved once by the visible-host deterministic planner, then Product Core owns execution of the immutable route.
3. React state after start is a projection. A React callback must never be required for the next audible event.
4. The worklet transports config/events and publishes requested telemetry. Do not add a second musical scheduler in worklet JavaScript.
5. Every realtime runtime has its own seeded RNG state derived with `hashU32`; do not consume an unrelated feature's RNG stream. The phase 8L planner uses its own deterministic stream and uploads the continuation cursor with the prepared schedule.
6. All arrays are fixed-size POD storage. No allocation, lock, JSON, logging, or host callback is permitted from render.
7. Runtime transitions must be derived from `transport.sample_frame`. `Date.now()`, `performance.now()`, `setTimeout`, `setInterval`, and `requestAnimationFrame` are forbidden as sound authorities.
8. Configuration updates use staging plus atomic commit. Render sees either the complete old config or the complete new config.
9. Keep the existing TypeScript behavior only as a deterministic test oracle until parity passes. It must not remain a production fallback.

### Shared render pattern

Add fixed runtime state in `cpp/KesshoCore/src/product/ProductSonicRuntimeState.h` and feature implementations under `cpp/KesshoCore/src/product/music/` or `cpp/KesshoCore/src/product/sequencer/`. Register new C++ files in `scripts/kessho-core-build-manifest.mjs`.

Generate events for the current render block before rendering its segments. Do not advance an audible state machine only after the block has already rendered.

```cpp
void KesshoProductEngine::scheduleSonicRuntimeEvents(uint32_t frames) {
  const uint64_t block_start = transport.sample_frame;
  const uint64_t block_end = block_start + frames;

  scheduleSourceMorphAutomation(block_start, block_end);
  scheduleRoutingMuteGroups(block_start, block_end);
  scheduleScatterEvents(block_start, block_end);
  scheduleSceneRuntimeEvents(block_start, block_end);
}
```

For a discrete event inside the block, use the existing sample-offset event/sequencer-event pattern:

```cpp
const uint64_t absolute_frame = runtime.next_boundary_frame;
if (absolute_frame >= block_start && absolute_frame < block_end) {
  const uint32_t offset = static_cast<uint32_t>(absolute_frame - block_start);
  emitRuntimeEvent(offset, target_id, param_id, value);
}
```

Continuous gain ramps must be evaluated per sample or through the existing DSP smoother. Whole-scene controls may update at a bounded control interval no larger than one render quantum; do not emit hundreds of events every sample.

### Shared ABI update procedure

For every snapshot/event change:

1. Add schema constants without renumbering existing public IDs.
2. Update C headers, TypeScript event types/builders, snapshot types, encoder byte-size checks, WASM bindings, and native ABI layout tests together.
3. Add invalid-count, invalid-index, non-finite-value, and incomplete-staging tests.
4. Run `npm run core:product:generate` and inspect generated diffs.
5. Run `npm run core:product:abi`, `npm run core:product:snapshot-regression`, `npm run core:product:wasm`, and `npm run core:product:web-host`.

## Phase 8E: Add the Sonic-Autonomy Harness

### Files

- Add `cpp/KesshoCore/tests/ProductSonicAutonomyTests.cpp`.
- Add `scripts/check-kessho-product-sonic-ownership.mjs`.
- Add package script `core:product:sonic-autonomy` that runs both checks.
- Update `scripts/check-kessho-product-background-audio-support.mjs` so pausing an audible feature is a failure, not a success.
- Correct `scripts/audit-kessho-apple-native-runtime.mjs`: the current Journey callback is sound-authoritative.

### Test harness contract

The test must configure a feature, then render without invoking any host callback:

```cpp
configureFeature(engine, fixture);
startTransport(engine);
for (uint64_t frame = 0; frame < kFiveMinuteFrames; frame += kBlockSize) {
  kessho_product_render(engine, left, right, kBlockSize);
  trace.capture(engine); // Fixed-size counters/hashes only.
}
```

For each migrated feature, compare two runs from the same snapshot and seed:

- control run: visible-host telemetry may be requested
- suspended-host run: no telemetry, UI callback, state patch, or host timer fires after transport start

Both runs must produce the same event trace, RNG end state, and deterministic PCM hash. A different seed must change at least one expected random decision.

### Static ownership checks

The script must fail while any audited production path remains sound-authoritative:

- Journey calls preset morph from `journeyState.ts` animation.
- Auto-Cycle calls `scheduleProductRuntimeParamUpdate` from its host timer.
- random mute groups schedule slot/fade changes with host timers.
- Scatter schedules hits with `window.setTimeout`.
- Random Live runtime tick is preview-only.
- source auto-morph has no Product Core config/runtime owner.
- auto-stop is evaluated only by `useVisibleInterval`.

Do not enforce a blanket ban on UI timers. Check named sound-authority functions and require the corresponding Product Core owner token and test fixture.

### Success criteria

- The new harness fails for at least Journey, Auto-Cycle, mute groups, and Scatter before migration.
- The checker cannot pass merely because a feature pauses hidden.
- Five accelerated simulated minutes complete without wall-clock waiting.
- The harness records no unbounded event or PCM arrays.

## Phase 8F: Source Auto-Morph and Product Auto-Stop

Implement these first because they prove the clock/config pattern with bounded state.

### Source auto-morph state

Support Pad 1, Pad 2, Lead 1, Lead 2, and all seven drum morph targets. `speed` means phrases per complete cycle, matching `SliderState`.

```cpp
enum class ProductMorphMode : uint32_t { Linear = 0u, PingPong = 1u, Random = 2u };

struct SourceMorphAutomationState {
  uint32_t target_id = 0u;
  uint32_t enabled = 0u;
  ProductMorphMode mode = ProductMorphMode::PingPong;
  float phrases_per_cycle = 8.0f;
  float held_random = 0.0f;
  int32_t direction = 1;
  uint32_t rng_state = 1u;
  uint64_t cycle_start_frame = 0u;
  uint64_t cycle_duration_frames = 1u;
};
```

Add a pure TypeScript compiler, for example `src/audio/product/compileProductSourceMorphAutomation.ts`. Pad mode is PingPong unless a real pad mode control is added. Lead and drum modes come from their existing state keys.

Do not assign `source.morph` in a second code path. Extract the current `KESSHO_PRODUCT_PARAM_SOURCE_MORPH_ID` behavior from `applySourceParam()` into one helper, then call that helper from manual events and automation. It must still call `applyStructuredSourceOverridesToModuleForCurrentMorph()` for pad/lead targets.

Derive phase from integer frame distance; do not repeatedly accumulate a float delta. For Random mode, choose one value only at the completed-cycle boundary and retain it until the next boundary. Fix or delete the unused `DrumMorphManager`; its current reset comparison occurs after phase assignment and cannot detect the wrap.

A manual morph edit disables automation for that target and holds the manual value. Apply the auto-flag and morph-value update in one committed patch so UI and Product Core cannot disagree.

### Auto-stop state

Convert the selected duration to one absolute target frame at enable time:

```cpp
struct ProductAutoStopState {
  bool enabled = false;
  uint64_t target_sample_frame = 0u;
};

if (auto_stop.enabled && transport.sample_frame + frames >= auto_stop.target_sample_frame) {
  scheduleTransportStopAt(auto_stop.target_sample_frame);
  auto_stop.enabled = false;
}
```

React may calculate the displayed remaining seconds from telemetry, but it must not decide when to stop.

### Tests

- Linear, PingPong, and Random fixtures at 44.1, 48, and 96 kHz.
- Exact phase/value after 1, 8, 32, and 1,000 phrases.
- Same seed produces the same Random sequence; different seed changes it.
- Manual morph disables that target's automation and holds the manual value.
- Auto-stop fires within one sample of the requested target, including a target inside a render block.
- Foreground and suspended-host output are identical.

### Success criteria

- Toggling every visible pad/lead auto-morph control changes Product Core telemetry and sound.
- No production owner calls `updateAutoMorph()` from a host clock.
- Auto-stop expires while the host is fully suspended.
- Active-feature CPU is no higher than the current foreground host implementation by more than 3% relative; missed quanta remain zero.

## Phase 8G: Move Arp Flow and Harmony Resolution into Product Core

Do not patch only Random Live. The host currently uploads absolute MIDI, so harmony-following arp notes can also remain tied to stale host-resolved harmony while Product Core harmony advances.

### Required config

Extend each Product arp lane with the complete normalized musical config already represented by `ProductArpConfig`:

- flow
- rate
- length
- pulse mask
- contour and contour mode
- boundary mode
- slot lane
- reset mask
- enabled/mode

Port `resolveTraversalIndex()` and pitch-pool boundary behavior from `src/audio/productArpeggiator.ts` into Product Core. At each arp note event, resolve from authoritative C++ harmony/chord-slot state. Random Live chooses from its lane RNG at note time. Dice Hold resolves once on config commit and retains the pattern.

Keep static uploaded MIDI only for an explicitly fixed/manual MIDI mode. It must not be the production implementation of harmony-following flows.

### Tests

- Port every existing `coreProductHarmonyParityRegression` arp fixture to C++.
- Cover all six flow modes, contour modes, boundary modes, source-slot locking, reset masks, and rates.
- Advance C++ harmony after host suspension and prove the next arp notes use the new harmony.
- Random Live must change audible notes while its React page is unmounted and while no telemetry is requested.
- Same seed/config produces identical notes; preview telemetry matches the audible notes.

### Success criteria

- `arpRuntimeTick` is deleted or is UI projection only with no independent musical RNG.
- Product Core no longer requires React rerenders to follow harmony.
- Random Live changes at the documented musical boundary, not every arbitrary 250 ms.
- Existing non-random arp event streams remain exact; PCM correlation is at least 0.9999 and loudness delta is below 0.1 dB.

## Phase 8H: Move Scatter into Product Core

### Required design

Port the pure phrase generator first, then the scheduler. Do not upload a finite queue of future phrases; background duration is unbounded.

- Convert `SeqScatterState` into a fixed `ProductScatterConfig` with one entry per drum voice.
- Port `generateScatterPhrase`, cooldown calculations, probability, velocity, morph/distance/expression patches, and ratchets.
- Use one independent RNG stream per drum voice plus one selector stream.
- Schedule hits through the existing Product drum trigger path with sample offsets.
- Keep recent-phrase avoidance in a fixed ring with the same bounded history length as TypeScript.
- Publish only current phrase ID, voice, step, and pulse counters for UI projection.

The TypeScript hooks become editor/manual-audition code only. Automatic playback must not call `useScatterSequencerRuntime()` or `useScatterPhrasePlayer()`.

### Porting sequence

1. Add C++ phrase-generation fixtures using the exact seeds from `scatterPhrasePrinter.test.ts`.
2. Match phrase fields before producing audio.
3. Add cooldown and voice-selection fixtures.
4. Add sample-offset trigger fixtures including ratchets.
5. Connect the snapshot/event bridge.
6. Switch production ownership.
7. Delete automatic host scheduling only after all fixtures pass.

### Success criteria

- Existing TypeScript and C++ phrase fixtures match for every field or an explicitly approved sonic-tolerance mapping.
- A five-minute accelerated suspended-host render continues producing Scatter phrases with no timer or queue starvation.
- Hit timing differs by no more than one sample from expected sample-frame positions.
- No allocations occur after Scatter starts.
- CPU with Scatter active is no more than 3% relative above the current visible-host implementation; p99 improves or remains unchanged.

## Phase 8I: Add the Bounded Product Scene Program

Journey and Auto-Cycle morph complete presets. Do not upload full snapshots every 100 ms. Compile endpoint states once into a bounded program Product Core can evaluate.

### TypeScript compiler

Add `src/audio/product/scene/compileProductSceneProgram.ts` and tests. Reuse current state normalization, Product event mappings, source-preset endpoint resolution, user-preference exclusions, and morph interpolation policy.

```ts
type ProductSceneInterpolation = 'linear' | 'log' | 'discrete-a' | 'discrete-b' | 'enable-gate';

type ProductSceneEntry = {
  targetId: number;
  paramId: number;
  index: number;
  valueA: number;
  valueB: number;
  interpolation: ProductSceneInterpolation;
  threshold: number;
};

type ProductSceneProgram = {
  entries: ProductSceneEntry[];
  boundaryCommandsA: CoreProductEvent[];
  boundaryCommandsB: CoreProductEvent[];
  requiredAssetIds: number[];
  unsupportedKeys: string[];
};
```

The compiler must return `unsupportedKeys` and refuse playback when the list is non-empty. Never silently drop a preset field.

Add `scripts/measure-kessho-product-scene-capacity.mjs`. Measure the default preset, maximum-CPU preset, maximum-memory preset, one sample-heavy preset, one soundscape-heavy preset, the actual Auto-Cycle/Journey fixtures, and one maximum-control fixture. Generate each capacity as `nextPowerOfTwo(ceil(maxObserved * 1.25))`, with hard caps of 1,024 continuous entries and 512 boundary commands. Fail generation if either hard cap is exceeded; do not estimate capacity from total schema parameter counts and do not raise a cap without CPU and memory review. Commit the generated capacities so all hosts share the same ABI.

### Product Core runtime

Use Begin/Entry/Commit events to upload into staging storage. On commit, validate counts and atomically swap active/staging indices. Store no strings.

Evaluate one morph scalar per render quantum. Apply only entries whose quantized value changed beyond the parameter epsilon. Reuse the same internal parameter application helpers as manual events. Discrete commands fire exactly once when crossing their threshold in either direction.

### Oracle tests

For the representative capacity corpus listed above:

1. Evaluate the current TypeScript `lerpPresets()` oracle at positions 0, 0.25, 0.49, 0.5, 0.51, 0.75, and 1.0.
2. Evaluate the compiled Product scene program at the same positions. Add another position only when a production discrete threshold requires it.
3. Compare every mapped Product parameter and every discrete boundary command.
4. Assert `unsupportedKeys` is empty.
5. Render full transitions in both directions and compare PCM/loudness.

### Asset rule

`requiredAssetIds` is the union for all endpoints that may run while hidden. Start must return typed `not-ready` until the complete closure is registered. If the closure exceeds the hard mobile budget, refuse to start and expose the exact required/available byte counts; do not evict an active Journey node or silently substitute another asset. Phase 8L may offer an explicit user-approved background-optimized route that references fewer Journey nodes, but it must preserve the saved Journey and disclose the included-node count and measured closure.

### Success criteria

- Largest supported scene compiles within fixed limits with zero unsupported keys.
- No periodic full snapshot crosses the host/worklet boundary during a morph.
- Endpoint values are exact; intermediate values match the oracle within `1e-5` or the existing parameter step.
- Scene runtime stays below the stable 25% absolute mean CPU cap in CI, with p99 below one render quantum and zero missed quanta. Relative mean deltas may be recorded diagnostically, but are not gating because host frequency variance makes them non-deterministic.

## Phase 8J: Move Routing Mute Groups into Product Core

### Config and runtime

Support all eight slots. Compile each slot into:

- source mute bit mask
- eligible flag
- minimum and maximum hold duration in quarter-phrase integer units (the production UI supports `0.25`-phrase steps)
- discrete scene commands for stored boolean state
- transition duration in sample frames

Add `runtime_mute_gain` and `runtime_muted` separately from the user's configured source level/enabled state. A mute transition ramps the runtime gain to zero, then suppresses unnecessary source rendering. Restore enables the runtime path at zero and ramps up without changing the saved source level.

```cpp
struct RoutingMuteGroupRuntime {
  uint32_t active_slot = 0xffffffffu;
  uint32_t next_slot = 0xffffffffu;
  uint64_t next_change_frame = 0u;
  uint64_t fade_start_frame = 0u;
  uint64_t fade_end_frame = 0u;
  uint32_t rng_state = 1u;
};
```

Choose slots and durations only at phrase-derived sample boundaries. Select uniformly from eligible slots, preserve avoid-repeat behavior, and select hold duration uniformly from the inclusive quarter-phrase range. A manual slot command takes effect through the same ramp implementation.

### Tests

- Port current fake-scheduler transition tests to Product Core sample frames.
- Cover no-repeat, eligible slots, empty slots, quarter-phrase ranges, transport pause/resume, manual recall, and scene booleans.
- Start a fade near a render-block boundary and verify every sample of the gain envelope is monotonic.
- Suspend the host during fade-down, hold, random selection, and fade-up.

### Success criteria

- Slot changes and fades complete with no host callbacks.
- No fade can remain permanently at an intermediate value.
- Foreground and suspended-host runs have identical slot/RNG traces and PCM.
- Delete the 250 ms runtime snapshot interval; UI reads Product telemetry on its normal visible cadence.

## Phase 8K: Move Global Auto-Cycle into Product Core

Compile the selected A/B presets with phase 8I, then upload this small state machine config:

```cpp
enum class SceneCyclePhase : uint32_t { Hold, Entry, PlayA, MorphAB, PlayB, MorphBA };

struct SceneCycleRuntime {
  bool enabled = false;
  SceneCyclePhase phase = SceneCyclePhase::Hold;
  uint64_t phase_start_frame = 0u;
  uint64_t phase_end_frame = 0u;
  float morph = 0.0f;
};
```

Durations remain phrase based. Preserve current entry, hold, endpoint, direction, CoF-reset, discrete-toggle, and user-preference behavior through scene-program commands. UI countdown and morph position come from telemetry.

### Success criteria

- Auto-Cycle completes 1,000 phase transitions with no host callback.
- Hiding/foregrounding does not pause, skip, or replay phase time.
- A/B endpoint sequence and phase durations match the foreground oracle within one sample.
- Changing play or transition phrase counts does not restart the active phase; the next applicable phase uses the new duration.
- In Product mode, `useMorphPositionRuntimeSurface.ts` runs no automatic audio-state timer or automatic `scheduleProductRuntimeParamUpdate()` loop. The guarded reference-runtime compatibility path is outside Product sound ownership.

## Phase 8L: Compile a Bounded Two-Hour Journey Schedule

**Status:** Complete in software on 2026-07-18. Physical phase 9 advanced acceptance remains pending.

This is last because it depends on the phase 8I scene program, phase 8K sample-frame hold/morph behavior, and the phase 5 mobile asset working set. Do not add a generalized graph engine. The visible host resolves the current Journey graph into a fixed schedule; Product Core executes that schedule without graph traversal, random selection, preset lookup, or asset preparation after start.

### Fixed product and platform scope

Support only the production model in `src/audio/journeyTypes.ts`: four preset nodes, one center node, and at most 20 directed connections. Target at least 7,200 seconds of prepared playback. Use one conservative `ios-web-background` profile validated on iPhone 11 and initially apply it to every iOS browser rather than inferring an iPhone model from browser APIs.

```ts
const IOS_WEB_BACKGROUND_JOURNEY_LIMITS = {
  targetSeconds: 7_200,
  maxScheduleEntries: 512,
  maxPresetNodes: 4,
  maxConnections: 20,
  registeredAssetSoftBytes: 160 * 1024 * 1024,
  registeredAssetHardBytes: 192 * 1024 * 1024,
  hostDecodedBytes: 16 * 1024 * 1024,
  maxConcurrentDecodes: 1,
} as const;
```

The 160 MiB soft target, 192 MiB hard limit, 16 MiB host cache, and one-decode limit must reuse `CoreProductAssetWorkingSet`; do not introduce conflicting memory constants. The general 384 MiB WebAssembly ceiling is not the iPhone 11 background admission target.

### Deterministic visible-host planner

Add a pure TypeScript planner under `src/audio/product/journey/`. It resolves preset references and snapshots while visible, derives a deterministic seed from the Journey revision plus Product seed, and preselects every weighted branch and min/max duration needed for the prepared interval. Replace `Math.random()` for prepared playback. Foreground and background playback must execute the same immutable plan so hiding the page does not change its route.

```ts
type BackgroundJourneyScheduleEntry = {
  fromNodeIndex: number;
  toNodeIndex: number;
  transitionProgramIndex: number;
  holdFrames: bigint;
  morphFrames: bigint;
  flags: number; // self-loop, ending, restart
};

type BackgroundJourneyPlan = {
  entries: BackgroundJourneyScheduleEntry[];
  loopStartIndex: number | null;
  totalFrames: bigint;
  rngStateAfterPlan: number;
  referencedNodeMask: number;
  revision: number;
};
```

Planning order is fixed:

1. Validate node, connection, preset-reference, and scene-program limits.
2. Resolve every referenced preset into a Product snapshot before any upload.
3. Select the weighted start edge with deterministic RNG.
4. Resolve the current node's hold duration from its configured min/max range.
5. Select the weighted next edge and resolve its morph duration.
6. Convert each resolved duration to sample frames using the production phrase timing that applies at that phase.
7. Repeat until `totalFrames >= sampleRate * 7_200` or 512 entries are used.
8. Compile and deduplicate only the directed transition programs referenced by the plan; repeated edges reuse one phase 8I program.
9. Persist the RNG state after the final planned choice for later visible-host extension.

At the default 16-second phrase, a one-phrase hold plus a half-phrase morph is 24 seconds, so two hours requires about 300 entries. If 512 entries cannot cover two hours, return typed `schedule-capacity`; do not raise the fixed capacity merely to accept unusually short durations.

### Explicit Journey semantics

The source model stores `autoAdvance` and `loopEnabled`, but the current host playback does not consume either field. Phase 8L defines their background behavior instead of guessing:

- `autoAdvance: false`: not eligible for unattended background Journey playback.
- `loopEnabled: true`: the planner must find a reachable closed cycle and set `loopStartIndex` to a schedule suffix whose final node connects to its first node.
- `loopEnabled: false`: eligible only when the naturally terminating route covers the full target duration.
- no outgoing edge or no reachable cycle before two hours: return a typed planning reason. Foreground-only playback remains available.
- after the prepared two-hour interval while hidden: repeat the validated closed suffix. If no suffix exists, hold the final scene; never invent an edge or jump between unrelated presets.

The center node remains start/end metadata and never requires a scene asset. Self-loops consume their prepared hold duration without compiling or applying a redundant scene morph.

### iPhone 11 web asset admission

Calculate the exact unique asset union from only the preset nodes referenced by the immutable plan. Include predicted sample variants and all soundscape assets. Deduplicate shared assets. Run two gates while the document is visible:

```ts
const MiB = 1024 * 1024;
const predictionReady = uniqueDecodedAssetBytes <= 160 * MiB;
const decodePeakReady = registeredBytes + largestPendingDecodeBytes <= 192 * MiB;
```

Then call the existing `CoreProductAssetRegistrar.ensureSceneAssets()` with every planned node state and require `backgroundAssetClosure()` to report:

- every required ID registered
- zero pending registrations
- `registeredDecodedBytes <= 160 MiB`
- no readiness error
- document still visible

Do not fetch, decode, or register an asset after the page is hidden. Registered asset bytes already inside the WebAssembly heap must not be counted a second time; host decoded bytes and the one in-flight decode reservation remain separate peak-memory domains.

If the full route exceeds the soft target, enumerate the at most 16 subsets of the four preset nodes. Offer a background-optimized plan only when a subset contains at least two playable nodes, has a reachable cycle, covers two hours within 512 entries, and fits the asset target. Rank valid subsets by included-node count, retained outgoing probability mass, duration coverage, and shared-asset reuse. Never modify the saved Journey. Starting the reduced plan requires explicit user confirmation.

### Product Core executor

Add a fixed-capacity, double-buffered `ProductJourneyScheduleRuntimeState`. Upload schedule entries and deduplicated phase 8I transition programs through Begin/Entry/Commit events and atomically swap only after complete validation. Store no strings, allocate no memory in render, and use `uint64_t` sample frames for all deadlines.

Product Core owns:

- current schedule index and loop index
- hold and morph phase deadlines
- scene-program position and discrete boundary commands
- self-loop, ending, restart, and final-hold behavior
- schedule revision and transition trace

Publish phase, current node index, next node index, schedule index, loop index, hold progress, morph progress, prepared total frames, transition count, and revision through demand-driven telemetry. The existing low-level `journey_phase` evolution clock must not remain a second independent Journey owner. Drive evolution depth from this prepared phase or rename the old control as an unrelated evolution LFO.

`src/ui/journeyState.ts` becomes editor state plus telemetry projection for Product mode. Remove its Product-mode `requestAnimationFrame`, `Math.random()`, and audio-authoritative `onMorphToRef` path. `useJourneyMorphRuntimeSurface.ts` may resolve and upload the prepared plan while visible, but must not animate or commit audible state after Product Core starts.

### User-facing admission states

Expose the result before background Journey starts:

| State | Required display |
| --- | --- |
| Ready | `Background ready · 2h 04m · 132 / 160 MiB` |
| Optimizable | `Background route available · 3 of 4 scenes` |
| Too large | `Background unavailable · 207 / 160 MiB` |
| Preparing | `Preparing audio · 11 of 14 assets` |
| Stale | `Journey changed · prepare again` |

Provide only the commands appropriate to the state: `Prepare`, `Optimize`, `Foreground only`, and `Cancel`. A failed or stale admission must disable background Journey start, not ordinary foreground Journey playback. If an unprepared Journey is already playing when the page hides, continue the current scene without host traversal and report the limitation when visible again.

### Fail-first tests

- Planner: weighted start, weighted branch, self-loop, center/end, missing edge, `autoAdvance: false`, loop-enabled closed suffix, loop-disabled natural ending, and invalid graph.
- Determinism: the same graph, presets, and seed produce the same 512-entry plan and RNG cursor; a different seed diverges where more than one weighted choice exists.
- Duration: prepared frames represent at least 7,200 seconds at the active sample rate without exceeding 512 entries; a short-duration fixture returns `schedule-capacity`.
- Optimization: enumerate all node subsets, retain the saved Journey unchanged, and select only a connected cyclic subset under budget.
- Memory: 160 MiB predicted closure is accepted, greater than 160 MiB requires optimization or foreground-only mode, and decode-time peak over 192 MiB is rejected.
- Assets: actual closure is complete before start, remains registered through stop, and hidden preparation returns `document-hidden` without invoking decode.
- Scene parity: every deduplicated transition matches the phase 8I seven-position oracle.
- Suspension: suspend before hold completion, during morph, during self-loop, and before loop restart; visible and suspended engines retain the same schedule index, phase, scene position, and PCM.
- Endurance: use an accelerated schedule covering at least 100 transitions; do not add a two-hour automated or physical test.

### Success criteria

- The production planner prepares at least `BigInt(sampleRate) * 7_200n` frames within 512 entries for the representative branching Journey.
- The prepared route and all required assets are immutable and closed before Product Core start.
- iPhone 11 admission stays at or below 160 MiB registered decoded assets and below the 192 MiB decode-time hard limit.
- A Journey that cannot meet schedule or memory limits receives a typed reason and cannot claim background readiness.
- Visible and suspended runs produce identical schedule, node, scene, phase, and RNG-cursor traces for at least 100 accelerated transitions.
- No React state update, preset lookup, graph traversal, random selection, network request, decode, or host timer is required after Journey starts.
- Foreground and suspended PCM correlation is at least 0.9999 with loudness delta below 0.1 dB.
- Existing visual Journey behavior follows demand-driven telemetry without controlling audio.
- Active Journey adds no more than 5% relative mean render CPU over the same sequence of phase 8I scene transitions and causes zero missed quanta.

## Sonic-Autonomy Milestone Gate

After each phase, run only its targeted C++/TypeScript tests, `npm run type-check`, and `git diff --check`. Run the full gate below once after 8H and once after 8L:

```bash
npm run core:product:generate
npm run core:product:abi
npm run core:product:snapshot-regression
npm run core:product:determinism
npm run core:product:harmony
npm run core:product:sequencer
npm run core:product:sonic-autonomy
npm run core:product:realtime-safety
npm run core:product:background-audio
npm run core:product:cpu-scenarios
npm run core:product:cpu-repeatability
npm run type-check
npm run build
git diff --check
```

Use one exploratory CPU run during each phase. At the 8H and 8L milestone gates, record each newly delivered active feature three times and use median mean CPU and median p99. Do not compare active native automation against a paused or disabled baseline.

Milestone success requires:

- zero missed render quanta
- less than 25% absolute mean CPU for each ordinary and maximum-scene scenario in CI (35% for the active-FX stress scenario)
- p99 below one render quantum with zero missed quanta
- relative mean deltas remain diagnostic/non-gating; host frequency variance must not fail the milestone
- identical deterministic event/RNG traces between visible and suspended-host runs
- PCM correlation at least 0.9999 and loudness delta below 0.1 dB where exact PCM is not expected
- zero host sound-authority callbacks required after transport start in an autonomous playback scenario
- zero hidden fetches, decodes, UI timers, or telemetry publications

## Phase 9: Physical-Device Acceptance

Static source checks and simulator runs are prerequisites, not acceptance evidence.

### Required matrix

| Device | Surface | Required run | Duration |
| --- | --- | --- | --- |
| iPhone 11 | Safari tab | Start visible, app switch, screen lock, foreground | 15 minutes total |
| iPhone 11 | Chrome tab | Start visible, app switch, screen lock, foreground | 10 minutes total |
| iPhone 11 | Home Screen install | Start visible, screen lock, lock-screen pause/play, foreground | 15 minutes total |
| Current iPhone | Safari tab | Start visible, screen lock, foreground | 10 minutes total |
| Current iPhone | Home Screen install | Start visible, screen lock, foreground | 10 minutes total |

Use the internal speaker for every row. Repeat only the iPhone 11 Home Screen row over Bluetooth and include one interruption such as an incoming-call simulation. Wired output is optional unless a routing defect is under investigation.

Do not repeat every feature on every surface. Use these compact scenario bundles:

1. Base milestone bundle on iPhone 11 Safari: Pad/Lead auto-morph, Random Live arp, and Scatter active together for 10 minutes.
2. Base milestone bundle on iPhone 11 Home Screen: maximum-CPU preset plus Scatter for 10 minutes.
3. Advanced milestone bundle on iPhone 11 Home Screen: prepare a two-hour branching Journey plan, verify its readiness summary and asset closure, then run random mute groups, Auto-Cycle, and that Journey together for 15 minutes. Run this only when accepting 8I-8L; do not turn it into a two-hour physical test.
4. Current-device smoke bundle: maximum-CPU preset and whichever milestone features are enabled for 10 minutes on Safari or Home Screen.
5. Auto-stop bundle: configure a two-minute stop, lock the screen for three minutes, and confirm the Product Core frame target fired without foregrounding.

Capture the Product Core event/RNG trace hash before lock and after foreground restoration. UI telemetry may be absent while locked, but the final trace and runtime state must match the expected uninterrupted run.

### Hard acceptance gates

- No process termination during any required run.
- No missed render quantum increase during stable locked playback.
- No audible gaps longer than 20 ms; no repeated gap pattern.
- No missing-asset count increase while hidden.
- `decodedAssetBytes <= 192 MiB` at all times, prepared background Journey closure is `<= 160 MiB`, and ordinary deferred releases return under the soft budget.
- `assetAllocationBytes` stabilizes after warm preset cycling.
- The warmed `wasmHeapBytes` high-water mark does not rise on a second identical cycle.
- Hidden UI callback count is zero.
- Foreground restoration produces one state refresh and no burst of stale events.
- Foreground versus hidden output for a fixed deterministic scenario meets correlation `>= 0.9999` and loudness delta `< 0.1 dB`.
- Whenever the audio render callback remains active, every sonic-autonomy scenario advances through the locked interval; pausing and resuming from the pre-lock phase is an engine failure.
- Whenever the audio render callback remains active, auto-stop ends playback at the configured Product Core frame without foregrounding the page.
- iPhone 11 thermal state does not cause sustained dropouts during the 15-minute highest-CPU or advanced-feature scenario.

Safari or Chrome may still have the entire audio callback suspended by browser/OS policy. Distinguish that from an engine failure by checking whether `transport.sample_frame` advanced. If it did not advance, record a best-effort platform suspension; if it advanced while the feature state did not, fail the implementation. Do not add busy-loop workarounds. Home Screen and the installed app remain the stronger delivery surfaces.

### Full milestone commands

```bash
npm run core:product:generate
node scripts/check-generated-files-clean.mjs
npm run type-check
npm run core:product:ci:prereqs
npm run core:product:cpu-scenarios
npm run core:product:cpu-repeatability
npm run core:product:background-audio
npm run core:product:mobile-web-evidence:acceptance:base
# After 8L, use core:product:mobile-web-evidence:acceptance:advanced instead.
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
- A production host timer, animation frame, React effect, or telemetry callback remains authoritative for a phase 8E-8L sonic feature.
- A scene or Journey compiler silently drops an unsupported state key or required asset.
- A simulator or static token check is presented as physical-device proof.

## Definition of Done

The undertaking is complete only when:

1. Phases 0-8L and phase 9 pass, and physical evidence is recorded for both required iPhone generations.
2. Shared Product Core CPU is lower with unchanged deterministic master output.
3. Mobile decoded allocations remain bounded across repeated state changes.
4. Hidden playback performs audio rendering and minimal interruption bookkeeping only.
5. Ongoing musical timing, prepared Journey route execution, fades, scene morphing, Scatter, arp harmony resolution, and auto-stop are owned by Product Core sample frames, not the browser main thread. Journey branching and random duration choices are resolved into the immutable schedule while visible and never recalculated by a suspended host.
6. Browser failures caused by OS suspension are explicitly recorded instead of hidden by unsupported workarounds.
7. Native Apple routing remains a separate, measurable phase and uses the same Product Core state/event/asset contracts.
