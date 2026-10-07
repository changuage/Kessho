# Combined mobile CPU implementation plan

Prepared: 2026-09-13. This is the entry point for implementing both CPU audits. The [detailed A–D plan](engine-cpu-a-d-implementation-plan.md) is a subordinate engine work package; its exclusions apply to that package, not to this combined assignment.

## Handoff contract

Read this document, the linked A–D work package, and applicable repository instructions before editing. This is an implementation assignment; complete one stage and its exit checks before advancing. Source locations describe the working tree reviewed on 2026-09-13, which contains uncommitted capture work. Re-read current implementations; if a fix is already present, verify it rather than duplicate it. Baseline the current source, not an older committed version.

Keep the combined results document as the status index. For each stage record: pending / implemented but verification blocked / verified / not required with evidence. Include the exact next action when pausing. A successful build alone does not verify timing or audio behavior. Keep diagnostic counters in tests or remove temporary instrumentation; add no production profiling infrastructure, dependency, generic cache, scheduler or loader framework.

R1/R2/C/D/A/B have concrete implementation and acceptance instructions. L has a measurement gate: staged copying is conditional, and its allocation/headroom limits must be demonstrated. S requires an explicit support target and device acceptance. Do not turn either conditional track into an unsupported promise or let it block the preceding CPU fixes.

## Proportionate verification

Use one focused regression scenario per fix, extending existing coverage. A scenario may contain the few transitions needed to expose that fix's failure modes; it is not a requirement for a separate fixture for every permutation. Preserve existing tests and required repository gates, but do not build a new test system or repeat broad suites after every stage. Run relevant existing integration checks once at the end. Duplicate native/web coverage only where their implementations differ.

Retain the implementation safeguards below: they explain dependencies, not a mandate to generate tests for every sentence. Add coverage beyond the focused scenario only for a changed dependency that remains untested or an actual failure. Measure the compact-clock improvement first. Introduce further batching, scheduling or loading machinery only as the corresponding stage needs it.

## Execution order

| Order | Work | Dependency / reason |
| --- | --- | --- |
| 0 | Capture current-source baseline and existing failures | Follow Stage 0 of the A–D plan; capture each stage baseline when reaching it. Start with recording; defer live-load measurement until L. |
| 1 | R1: compact recording clock | Highest-priority confirmed repetition: up to 750 full telemetry rebuilds/second while recording. |
| 2 | R2: recording heartbeat and preview publication | Use R1's authoritative clock. Do not reduce messages until timing/correlation works correctly. |
| 3 | C: reverb configuration | Follow the A–D plan's Stage 1. |
| 4 | D: stationary spectral analysis | Follow the A–D plan's Stage 2. |
| 5 | A: dedicated master path | Follow the A–D plan's Stage 3. |
| 6 | B: scoped FX configuration | Follow the A–D plan's Stage 4, preserving A/C/D. |
| 7 | L: live asset-admission stalls | Measure callback time separately from render; implement the smallest fix supported by the result. |
| 8 | Integrated software verification | Combine the A–D final checks with recording and live-load checks; rebuild before checking WASM. |
| Separate track | S: older-Safari compatibility | This expands browser support rather than reducing CPU. Establish the minimum OS/browser before committing to scalar support. |

Use one implementer sequentially. Do not add worker/agent orchestration. Independent inspections can run concurrently; shared builds, report writers and performance measurements must not race. Do not implement engine findings E–G.

Use only `docs/reports/mobile-cpu-implementation-results.md`: one small results table and shared build/integration notes; no separate engine report. Distinguish operation counts, native CPU timing, desktop WASM timing and physical-iPhone evidence. Never convert a missing measurement into zero.

## R1 — Remove full recording telemetry rebuilds

### Read first

- `cpp/KesshoCore/adapters/wasm/kessho-core-product.worklet.js`: `process`, `readCaptureClock`, `updateCaptureClock`, capture start/finish and clock segments.
- `cpp/KesshoCore/include/KesshoCore/KesshoProductCaptureClock.h` and every producer/consumer found by searching for `KesshoProductCaptureClock` and the capture-clock copy API.
- `src/audio/coreProductRuntime.ts`, recording clock types, and the native recording adapters.
- `src/ui/sequencer/useRecordedNoteCapture.ts` and existing recording timing tests.

### Implement

1. Count full telemetry refresh/copy calls during a warmed capture, with ordinary visual diagnostics disabled. Reproduce the pre/post-render caller relationship. At 48 kHz / 128 frames, there are 375 quanta/second and currently two full reads per quantum.
2. Add `double current_bpm` after `current_beat` in the compact clock, preserving existing offsets and reserved=0. For the reviewed schema 1, use schema 2, size 32 bytes, BPM offset 24; assert all field offsets and size. Bump the shared Product ABI consistently from its current value (reviewed value 7) in `KesshoProductTypes.h`, `ProductRuntimeCapabilityReport.ts` and the authoritative worklet ABI check. If intervening work has already changed these versions, reconcile the contract instead of reusing a version with different semantics. Do not change the unrelated core ABI or persisted schemas.
   - The worklet must reject an incompatible Product ABI **before allocating/copying the clock**. The copy function has no destination-capacity argument: checking schema after a 32-byte write into an old 24-byte buffer cannot prevent corruption. Then validate the returned clock schema as well.
   - Update `CAPTURE_CLOCK_BYTES`, decoding offsets, ABI layout checks, generated assets and test fakes together. Both `check-kessho-product-wasm.mjs` and its debug counterpart contain fake clock-copy functions: make them write valid fields; do not weaken validation to accommodate an empty fake.
3. Copy BPM directly from the same engine transport state as sample/beat position. This accessor must not call `updateTelemetry`, refresh visual state or scan voices/assets.
4. Update native/shared header layout, producer, worklet byte allocation/decoding, relevant adapters and ABI tests together. Keep persisted preset/snapshot schema unchanged unless independently required. This clock-layout change is an explicit exception to the A–D package's default ABI boundary.
   - In `cpp/KesshoCore/src/product/native/KesshoNativeProductRuntime.h`, extend `PublishedCaptureClock` with atomic BPM bits and include them in the existing sequence-protected publish/copy epoch, including `recorded_capture_origin_`. Do not add a separately read non-atomic BPM. Extend `runNativeCaptureClockConcurrencySmoke` in `ProductNativeRenderPathTests.cpp` to check coherent sample/beat/BPM snapshots across tempo changes.
   - Check the Apple NSData bridge and `pollNativeCapture` in `CapacitorMac/Sources/KesshoCapacitorMac/KesshoCapacitorMacApp.swift`. Validate size/schema and consume authoritative BPM instead of inferring it from polling deltas where the new field supplies it. Preserve capture-origin behavior and existing native event semantics.
5. Replace `updateCaptureClock`'s full telemetry refresh/copy and hard-coded BPM offset with the compact value. Validate finite positive BPM and reject incompatible clock layouts through established runtime error handling. Do not substitute a UI BPM ref or restore full telemetry as a silent fallback. A malformed clock must reject/end the affected capture through existing error handling; do not repeatedly throw from the render callback or stop unrelated music playback.
6. Preserve both pre-render and post-render clock observations where finish/tempo semantics need them. The optimization is to make those reads small, not remove required timing boundaries.
7. Keep capture ownership, origin beat/sample, clock segments, tempo discontinuities, cancellation and explicit finish behavior unchanged. Regenerate the public worklet through existing tools; never edit it as the authoritative source.

### Focused check and exit gate

Extend existing capture coverage with one recording spanning a tempo change and finish. Assert correct clock/note timestamps and zero capture-driven full telemetry reads with diagnostics disabled. Keep the necessary clock layout/decoder check and extend the existing native publication concurrency check: these exercise different implementations. Reuse existing pause/cancel/origin coverage instead of creating another lifecycle matrix.

Measure capture-on cost against baseline using the existing harness; report removed calls separately from CPU timing. Run `npm run test:generated-sequencer-capture` once in final integration, not after every later stage.

## R2 — Reduce empty capture messages and preview updates

This stage depends on R1. It must not alter the audio-side note drain cadence or lose event delivery.

### Implement

1. Trace `drainRecordedCaptureEvents` → `postRecordedCaptureBatch` → runtime listeners → `useRecordedNoteCapture` ingestion/publication. Preserve session tokens and final event watermarks.
2. Keep draining the bounded audio-side ring every render block. Send note-containing batches promptly. Finish, ready, errors, overflow changes and required control acknowledgements bypass throttling.
3. Replace the four-block empty heartbeat with a cadence expressed in sample frames. Start with **20 Hz while visible** as a testable default, not as an established optimum. Require an immediate updated clock anchor when tempo or transport discontinuities would invalidate interpolation.
4. Use existing clock/audio-context correlation to estimate display position between anchors. Verify keyboard event timing too; it must not wait for the next heartbeat. If that cannot be preserved, retain enough clock updates and narrow the optimization to UI publication first.
5. Independently cap preview state publication to **20 Hz**, coalescing pending updates. Reuse existing scheduling utilities where appropriate. Final/error/cancel state should publish promptly. Do not rebuild unchanged note snapshots just to move a clock indicator.
6. While hidden, suppress periodic preview publication and empty UI-only heartbeat traffic. Keep note delivery, overflow handling, completion and required authoritative state updates bounded and correct. On foreground restoration publish one fresh anchor/current state; never replay a backlog of obsolete UI frames.
7. Avoid creating intermediate arrays when no generated events were drained, where this can be done locally. Do not introduce a generic object pool or redesign note persistence.

### Timing and lifecycle constraints

- Drive the worklet heartbeat from rendered frame count, not the transport sample clock, which can stop while audio callbacks continue. Preserve immediate discontinuity anchors; test that paused transport is never extrapolated as advancing merely because AudioContext time advances.
- `coreProductRuntime.ts` deliberately ingests authoritative capture progress while hidden. Preserve this ingestion and semantic watermarks. Suppress only proven UI-only traffic; when uncertain, keep the heartbeat and optimize preview publication first. Reuse the worklet's existing `host-visibility` message.
- Use a single pending preview task. If replacing an animation-frame handle with a timer, update its type and cancellation together. Cancel on finish/cancel/unmount and guard callbacks by session token so an old capture cannot publish into a new one. Do not run a 60 Hz loop merely to decide whether 20 Hz work is due.
- Extend the existing `useRecordedNoteCapture.test.tsx` scenario rather than creating a new suite. Ten seconds at 20 Hz means approximately 200 periodic publications, allowing initial/final/control messages separately; do not count event batches as empty heartbeats.

### Focused check and exit gate

Use one scenario combining a silent interval, generated and keyboard notes between heartbeats, hidden/resume, and finish followed by rapid re-arm. Assert the configured periodic rate, unchanged note order/timestamps/final delivery, and no stale preview from the old session. Include paused-clock behavior if interpolation changes. Count messages and preview publications separately using test-only instrumentation. Reuse R1's clock coverage; rerun it only if this stage changes that path.

## L — Bound live asset-admission work

### Read first

- Worklet `registerAsset`, allocation/release handling and memory-view refresh.
- `src/audio/coreProductRuntime.ts` registration promises and transferred ownership.
- `CoreProductAssetRegistrar.ts`, `CoreProductAssetDecodeService.ts`, working-set admission and background asset closure.
- Existing asset-release, mobile-policy and memory-accounting tests.

### Measure before choosing the implementation

1. Add test-harness timing around the **registration message handler**, separately from `process()`. Measure copies, allocation and memory growth where possible. The current render-duration missed-quantum counter does not include message-handler time.
2. Sustain audible playback while loading the largest permitted representative asset, including a heap-growth case. Test preset cycling and on-demand sample-note loading. Record asset bytes, callback duration, output discontinuities and memory high water.
3. First ensure known required assets and necessary capacity are prepared before initial playback. Reuse existing readiness/admission rather than creating a second loader. Do not suspend active playback to disguise a live-loading problem.
4. If a remaining live copy exceeds available callback headroom, implement bounded staged copy with existing ownership accounting. Begin → chunk copies → final registration/acknowledgement is sufficient. Publish the asset to Product only when complete. Do not add SharedArrayBuffer/workers/cross-origin isolation as the first solution.
5. Bound both bytes copied per block and the number of pending admissions. Pick the budget from measured headroom, accounting for A–D render cost. Chunking copies does **not** fix an unbounded allocation or memory growth at the beginning; explicitly measure and address that part too.
6. Preserve channel/frame/flag validation, duplicate registration rejection, cancellation, reset/disposal, partial-allocation cleanup, release acknowledgement and admission reservations. Do not resolve the host promise before Product registration succeeds. Avoid retaining an extra full PCM copy.
7. Do not raise memory ceilings or eagerly preload all libraries. Keep the existing background closure contract; incomplete staged admissions are not background-ready assets.

### Staged-copy contract, only if measurements require it

Use the existing admission owner and request/session identity. Start with one active live admission and a bounded waiting policy, reusing the existing reservation limit; never create a second unbounded queue. The local lifecycle is validated/reserved → allocated/copying → registered/acknowledged, or failed/cancelled. Track channel/frame copy offset and owned allocations. One terminal path releases temporary memory/reservations and resolves or rejects the original request exactly once. A release/reset racing with copying must not allow a later completion to resurrect the asset.

When playback is active, use a fixed byte budget derived from measured headroom, not a clock-polling loop inside `process()`. Refresh WASM views after any possible memory growth. Registration itself must also fit the measured budget. Allocate failure cleanup incrementally so failure on the second channel frees the first.

When the context is suspended or startup waits for assets, callbacks may not run. Do not queue startup copies exclusively into `process()` and then wait for readiness before starting that same process: this deadlocks. Reuse the existing preplay registration path when no active render can be stalled; test suspended startup, resume with a pending admission, and disposal before completion. Do not suspend ongoing playback to enter this path.

If allocation/growth still exceeds headroom after copying is bounded, record L as incomplete with that specific blocker. Do not solve this by claiming chunking also bounds allocation, silently dropping live-load support, or raising memory limits.

### Focused check and exit gate, only if loading changes

Extend an existing admission scenario to load a representative large asset during audible playback and verify output continuity, measured callback work and complete-only publication. In the same harness exercise cancellation and partial-allocation failure; assert exactly one terminal acknowledgement, released reservations and no leaked memory. Include suspended startup if adding process-driven copying, to catch the readiness deadlock. Reuse existing validation/reset/release cases rather than duplicating them.

Run the affected existing asset-policy/release checks once in final integration. Desktop evidence does not establish iPhone headroom; record missing device acceptance explicitly. If no loading code changes, retain the measurement and rationale without adding a new regression suite.

## S — Older Safari support, separate from performance fixes

The current SIMD binary imposes a browser feature floor. A scalar fallback can widen compatibility but may use **more CPU**. Keep the SIMD artifact for supported devices.

1. Establish the intended minimum iPhone **and OS/Safari version**. Older hardware running a newer OS is a different target from pre-16.4 Safari. If no minimum is specified, complete a capability inventory and present the concrete target choice; do not invent a supported version or mark fallback acceptance complete.
2. Inventory actual emitted WASM features, JavaScript syntax, runtime APIs and required audio APIs against that target. `target: esnext` and SIMD are not the only possible blockers. Verify support using primary platform documentation.
3. If pre-SIMD Safari is in scope, add a scalar build from the **same DSP source** with identical settings except necessary feature flags. Confirm no SIMD opcodes remain. Do not revive the retired reference engine.
4. Use a small capability probe before selecting the artifact. Update versioning, caching, retry and embedded-asset paths together so scalar and SIMD assets cannot be confused. Never change sound parameters simply because scalar was selected.
5. Set a matching explicit Safari JavaScript target. Add only demonstrated runtime API compatibility measures; transpilation alone does not supply missing APIs.
6. Run audio correctness and CPU/headroom acceptance on both selected paths and the actual minimum browser. Default startup, presets, capture, sample loading and interruption/resume must work before claiming support.
7. Release/support status must distinguish “scalar builds and passes desktop tests” from “minimum device/browser accepted.” This track must not delay delivery of the safe CPU improvements to already supported browsers.

## Integrated completion

Use the single final pass in the A–D plan plus `npm run test:generated-sequencer-capture` and affected asset checks only if loading changed. Count focused clock/ABI results already obtained; rerun only when subsequent changes invalidate them. Rebuild artifacts before WASM checks. Keep a separate status row for R1, R2, C, D, A, B, L and S; never describe all findings as fixed when only A–D are complete.

Deliver implemented changes, operation-count/timing comparisons, audio correctness evidence, test results and device/support limitations. R1 is the first implementation task after baseline capture.
