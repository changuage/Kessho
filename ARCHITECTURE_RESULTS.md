# Architecture Results

Date: 2026-06-27

Scope: architecture/runtime/native/CPU phases covering Product Core production truth, fail-closed runtime policy, architecture guards, lifecycle serialization, ProductEnginePort facet decomposition, core host visual split, frame-coalesced diagnostics, modulation/perf callback gating, App shell extractions, C++ realtime-safety gates, mobile debug policy, shared native bridge validation/lifecycle vocabulary, macOS bridge hardening, and Product Core CPU gates.

## Summary

- Product Core remains the single production runtime truth.
- Production reference/web-ts fallback is forbidden by `ProductRuntimePolicy`, `createProductionProductEngine`, and `architecture:product-core-truth`.
- `WebProductEngine` lifecycle calls are serialized through `ProductRuntimeLifecycleController`; `suspend()` and `resume()` now return promises.
- Realtime MIDI/live-note cold bootstrap is coalesced through `CoreProductRealtimeInputBootstrap` instead of launching duplicate detached bootstrap chains.
- Realtime MIDI/live-note timestamp-origin mapping now lives in `CoreProductRealtimeTimestampMapper` instead of inline host state.
- `ProductEnginePort` remains a stable compatibility export, while focused facets now live under `src/audio/product/ports/`.
- Sequencer visual publication and morph feedback now live in `CoreProductSequencerVisualBridge`; idle telemetry skips step visual computation when no step callbacks are registered.
- Product diagnostics and host Product telemetry callbacks now use `ProductFrameScheduler` instead of microtask/direct per-event UI publication, coalescing callbacks to animation frames or low-rate hidden-tab timers.
- Sample-hold modulation feedback now advances trigger counters without constructing or dispatching UI payloads unless a sample-hold feedback callback is registered; runtime-walk position telemetry likewise skips UI payload clones when no `runtimeWalkPositions` callback is registered.
- Product CPU overlay/runtime comparison now uses a named `ProductPerfSnapshot` callback instead of subscribing to the full Product telemetry stream just to derive perf rows.
- Product Core state callbacks now detach outside `core-product` runtime mode, preventing reference/dev runtime selections from keeping Product Core state subscriptions active.
- Product Core telemetry getters, MIDI ingress, granular UI activity, and visual telemetry activation now no-op outside `core-product` runtime mode so reference/dev selections do not read from or wake Product Core telemetry paths.
- Product Core modulation range setters, runtime-walk callbacks, morph-clock controls, sequencer visual/trigger callbacks, and sequencer control event construction now no-op outside `core-product`, preventing shared sync/preset paths from waking Product Core during reference/dev runtime selections.
- Product Core manual trigger helpers and DAW output runtime sync now no-op their Product Engine mutations outside `core-product`; DAW routing/device preferences still persist without waking Product Core in reference/dev modes.
- Drum morph override access now uses local pure Product Control state outside `core-product`, preserving UI interpolation without reading or mutating Product Core control state in reference/dev modes.
- Synth page Anchor Walker performance events and generated sequencer capture telemetry now flow through Product runtime props, so `SynthPage` no longer imports `ProductEngineProxy` or constructs Product Core events directly.
- macOS Product Core lifecycle recovery now polls and resumes Product Core only in `core-product`, preventing reference/dev playback from waking Product Core recovery paths.
- `App.tsx` static styles, root slider/select controls, navigation constants, route flags, splash state, signed welcome state, responsive mobile shell state, lazy page declarations, debug/status rendering, DAW output sync, routing mute-group local/runtime sync, drum-sequencer source policy, dual-slider runtime state, drum scatter runtime state, drum morph preset interpolation sync, routing auto-enable/wetness state, drum-morph runtime access, native dual-range serialization, and morph endpoint math now live in focused `src/app/` and `src/features/morph/` modules, reducing the App root while avoiding cloud preset behavior changes.
- `coreProductEngineHost.ts` lifecycle start/resume/suspend/stop/dispose coordination now delegates to `CoreProductHostLifecycleCoordinator`, keeping lifecycle cleanup audited while reducing host-owned orchestration.
- Product Core preset boundary validation now consumes the existing normalized/materialized `SliderState` contract after preset migration, without changing Supabase V2 storage or latest-detail shapes.
- `cpp/KesshoCore/REALTIME_SAFETY.md` documents render-thread constraints and `core:product:realtime-safety` scans render/process functions for allocation, container growth, locks, logging, exceptions, and bridge calls.
- `native/KesshoNativeBridge` now owns shared Swift plugin/method allowlist and payload-cap validation; macOS bridge requests validate through it before dispatch.
- The same shared Swift package now owns native lifecycle policy vocabulary for foreground/background, protected data, route changes, interruptions, media-services reset, audio-continuation, prewarm, suspend-after-grace, and visual-telemetry throttling.
- macOS WebKit inspection is gated behind `#if DEBUG`.
- Mobile/debug diagnostics are guarded by `architecture:mobile-debug-policy`; CPU overlay remains opt-in, visibility-gated, and rate-limited.

## Phase Notes

### Phase 1: Runtime Truth And Lifecycle

- Added ADRs 0001-0005 for Product Core production truth, fail-closed startup, mobile-safe defaults, shared native bridge direction, and background-audio lifecycle.
- Added `ProductRuntimePolicy` and `createProductionProductEngine` fail-closed scaffolding.
- Serialized `WebProductEngine` lifecycle through `ProductRuntimeLifecycleController`.
- Split realtime MIDI/live-note cold bootstrap into `CoreProductRealtimeInputBootstrap`.
- Gated macOS WebKit inspection behind `#if DEBUG`.

### Phase 2: ProductEnginePort Facets

- Split the broad ProductEnginePort type surface into focused files in `src/audio/product/ports/`.
- Kept `src/audio/product/ProductEnginePort.ts` as the compatibility export for existing callers.
- Updated `migration:product-boundary`, `core:product:web-host`, `architecture:product-core-truth`, and `architecture:adapter-burndown` checks so raw Web Audio and legacy shape guards cover the decomposed port files.
- Updated `docs/product-core/product-engine-port.md` with the new file layout.

### Phase 3: Core Host Visual Split

- Added `CoreProductSequencerVisualBridge` for sequencer step visuals, synth orbit/anchor visual callbacks, and sequencer morph feedback.
- Added `CoreProductRealtimeTimestampMapper` for MIDI/live-note timestamp origin mapping on realtime ingress.
- Coalesced visible telemetry work so Product Core step visual computation only runs when `synthStepPosition` or `drumStepPosition` callbacks are registered.
- Kept callback registration behavior intact: running callbacks publish the current playhead when telemetry exists and do not emit a synthetic zero reset.
- Updated `core:product:web-host`, runtime fallback harnessing, and the running sequencer live-update gate to enforce the splits and callback coalescing.
- Current `src/audio/coreProductEngineHost.ts`: 886 non-empty LOC after visual, realtime bootstrap, timestamp mapper, telemetry scheduler, lifecycle coordinator, feedback gating, and narrow perf callback splits.

### Phase 4: C++ Realtime-Safety Gate

- Added `cpp/KesshoCore/REALTIME_SAFETY.md` with render-thread disallowed operations, required patterns, and verification commands.
- Added `scripts/check-kessho-product-realtime-safety.mjs` and `npm run core:product:realtime-safety`.
- Wired the realtime-safety guard into `architecture:strict`.
- Current guard result: PASS, 197 render/process functions scanned.

### Phase 5: Shared Native Bridge Validation

- Added `native/KesshoNativeBridge` Swift package with shared bridge request validation.
- Added plugin/method allowlists and per-method JSON options payload caps for `KesshoMidiRouting`, `KesshoAudioSession`, and `KesshoMacShell`.
- Wired `CapacitorMac` to depend on `KesshoNativeBridge` and validate `WKScriptMessage` payloads before macOS plugin dispatch.
- Added `npm run native:bridge:test` for Swift validator tests.
- Extended `architecture:mobile-debug-policy` so macOS must consume the shared bridge validation package.

### Phase 6: Shared Native Lifecycle Vocabulary

- Added `KesshoNativeLifecycleEvent` and `KesshoNativeLifecyclePolicy` to `native/KesshoNativeBridge`.
- Added shared policy fields for `audioMayContinue`, `throttleVisualTelemetry`, `requestPrewarm`, `requestSuspendAfterGracePeriod`, and `shouldResume`.
- Wired the iOS audio-session coordinator to emit shared lifecycle policy telemetry for background/foreground/protected-data states.
- Wired iOS audio-session route/interruption/media-services-reset events to include shared lifecycle policy payloads.
- Extended `architecture:mobile-debug-policy` so the iOS audio-session plugin must consume the shared lifecycle vocabulary.

### Phase 7: App Shell Surface Extraction

- Moved the static App style map from `src/App.tsx` to `src/app/appStyles.ts`.
- Moved pad/lead morph endpoint helper math from `src/App.tsx` to `src/features/morph/morphEndpointMath.ts`.
- Moved root slider/select controls and dual-range normalization helpers from `src/App.tsx` to `src/app/AppControls.tsx`.
- Moved advanced-tab navigation constants, keyboard shortcuts, and FX debug labels to `src/app/appNavigation.ts`.
- Moved splash timing/gradient state to `src/app/useAppSplash.ts`.
- Moved signed Snowflake welcome-state generation to `src/app/signedSnowflakeWelcomeState.ts`.
- Moved DAW output runtime sync to `src/app/useProductDawOutputSync.ts`.
- Moved routing mute-group runtime-level coalescing to `src/app/useRoutingMuteGroupRuntimeLevelSync.ts`.
- Moved drum morph override ProductEngineProxy access to `src/app/useProductDrumMorphOverrides.ts`.
- `src/App.tsx` no longer imports `ProductEngineProxy` directly.
- `architecture:adapter-burndown` now fails if `src/App.tsx` reintroduces a direct `ProductEngineProxy` import.
- Kept App cloud preset/query/detail behavior untouched; this phase only changed shell-owned static UI/style and morph state math.
- Reduced `src/App.tsx` from 6058 non-empty LOC to 4917 non-empty LOC in this phase; later App-shell batches reduced it further.

### Phase 8: Frame-Coalesced Diagnostics

- Added `ProductFrameScheduler` for diagnostics, telemetry, visuals, and MIDI activity channels.
- Replaced `ProductDiagnosticsPublisher` microtask scheduling with frame-coalesced diagnostics publication and low-rate hidden-tab scheduling.
- Added `CoreProductTelemetryCallbackScheduler` so host Product telemetry callbacks are frame-coalesced outside `coreProductEngineHost.ts`.
- Added `npm run test:product-diagnostics-scheduler` and wired it into `architecture:strict`.
- Added regression coverage for burst coalescing, hidden-tab timer scheduling, and immediate-publish invalidation.

### Phase 9: Product Core Preset Boundary

- Added `src/presets/productCorePresetBoundary.ts` to validate normalized materialized `SliderState` before Product Core consumption.
- Wired `normalizePresetForWeb` to enforce the boundary after existing migration, web compatibility, and crossfeed normalization.
- Added `npm run test:product-preset-boundary` and wired it into `architecture:strict`.
- Kept Supabase V2 storage, latest-manifest/detail materialization, hash identity, pagination, payload cache, and RLS behavior untouched.

### Phase 10: Modulation Feedback Gates

- Added `CoreProductSampleHoldFeedbackPolicy` so Product host sample-hold feedback publication is callback-aware.
- `CoreProductModulationRangeBridge` still advances trigger counters and debug state when callbacks are absent, but skips source/generic feedback payload construction and dispatch.
- Runtime-walk telemetry continues updating Product arrangement state patches, but skips cloning/publishing `runtimeWalkPositions` UI payloads when no callback is registered.
- Added `npm run test:product-sample-hold-feedback` and wired it into `architecture:strict`.
- Updated the VM behavior harness and `core:product:web-host` guard so the new policy remains part of the guarded Product host surface.

### Phase 11: Narrow Product Perf Callback

- Added named `ProductPerfMetric` / `ProductPerfSnapshot` Product-owned types to avoid broad inline perf callback shapes.
- Exposed the existing Product host `setPerfUpdateCallback` through `ProductEnginePort` diagnostics and `WebProductEngine`.
- Switched `useProductRuntimePerfAdapter` to consume `setPerfUpdateCallback` for core Product mode instead of full `setTelemetryCallback`.
- `productRuntimeUi` filters detailed Product perf snapshots down to CPU metric rows before `CpuOverlay`, preserving diagnostics on the telemetry/diagnostics surfaces.
- Updated architecture guards to require the narrow perf callback path.

### Phase 12: Runtime-Mode-Gated State Callbacks

- `useProductRuntimeStateRuntime` now registers Product Core state callbacks only when `productRuntimeMode` is `core-product`.
- Switching to reference/dev runtime modes immediately clears the Product Core state callback, so Product Core state/telemetry subscriptions do not stay active behind the selected reference runtime.
- `useProductRuntimeTelemetry` now gates Product Core telemetry getters, MIDI ingress, granular UI activity, range support checks, and visual telemetry activation by runtime mode.
- Reference/dev runtime modes receive cheap default Product telemetry values and clear Product visual telemetry instead of reading or activating Product Core.
- `migration:product-boundary`, `core:product:runtime-fallbacks`, and `core:product:web-host` now guard the Product-native state and telemetry mode-gating policy.
- `architecture:strict` now also runs the fail-closed runtime policy regression, serialized lifecycle regression, and `core:product:web-host` guard.

### Phase 13: Product-Native Control Callback Gates

- `useProductRuntimeModulationRanges` now gates Product Core range setters and runtime-walk callback registration by `core-product` mode.
- `useProductRuntimeMorphRuntimeSurface` now gates Journey morph clock callbacks, start/stop, and CoF drift reset by `core-product` mode.
- `useProductRuntimeSequencerCallbacks` now gates Product Core sequencer visual and trigger callback registration by `core-product` mode.
- `useProductRuntimeSequencerControls` now exits before Product event construction and Product control commits outside `core-product`, covering shared preset restore and page sequencer paths.
- `migration:product-boundary` now guards these Product-native control/callback no-op policies.

### Phase 14: Manual Trigger And DAW Sync Gates

- `useProductRuntimeManualTriggers` now gates lifecycle reads, Product Control commits, queued synth auditions, and direct manual trigger calls by `core-product` mode.
- The manual synth audition queue now checks the active Product runtime ref before executing queued work, so stale auditions cannot fire after switching to a reference/dev runtime.
- `useProductDawOutputSync` now keeps DAW routing/device preference persistence in all modes while skipping Product Engine routing and output-device mutations outside `core-product`.
- `src/App.tsx` now threads `productRuntimeMode` into DAW output sync so the source-level runtime ownership policy is explicit.
- `migration:product-boundary` now guards the manual trigger and DAW sync no-op policies.

### Phase 15: Drum Morph Override Runtime Gate

- `useProductDrumMorphOverrides` now receives `productRuntimeMode` and clears fallback state when Product Core becomes active.
- In `core-product` mode, drum morph override reads and actions continue to use the Product Engine-backed Product Control state.
- Outside `core-product`, drum morph override reads initialize local pure Product Control state and actions reduce locally without reading committed Product Core revisions or mutating Product Engine control state.
- `src/App.tsx` now passes `productRuntimeMode` into the drum morph override shim.
- `migration:product-boundary` now guards the mode-aware drum morph override policy.

### Phase 16: Synth Page Product Event Surface

- Added `useProductRuntimeSynthPageEvents` to own Product Core Anchor Walker performance event construction, generated sequencer capture enable/disable events, and generated capture telemetry polling behind `core-product` mode gates.
- `useProductRuntimePageRuntimeBridges` now augments `synthPageRuntimeProps` with the Product-owned Synth page event surface.
- `SynthPage` now receives Anchor Walker and generated capture callbacks through runtime props instead of importing `ProductEngineProxy`, creating Product Core events, or reading Product Core telemetry directly.
- Reference/dev runtime modes receive no-op/default generated capture behavior, preventing Synth page capture UI timers from waking Product Core telemetry.
- `migration:product-boundary` now guards the Synth page Product event surface and bans direct Product Core event/telemetry access from `SynthPage`.

### Phase 17: macOS Product Recovery Runtime Gate

- `useProductRuntimeMacRecovery` now consumes `productRuntimeMode` and derives a `productRuntimeActive` guard.
- The macOS Product Core recovery interval is disabled unless `productRuntimeMode` is `core-product`.
- Product Core lifecycle polling, `resume()`, and restart recovery now return early outside `core-product`, so reference/dev runtime playback does not wake Product Core recovery paths.
- `migration:product-boundary` now guards this macOS Product recovery mode-gating policy.

### Phase 18: App Shell Batch

- Added `useAppResponsiveShell` to centralize App mobile viewport state, mobile style overrides, and expanded-panel state.
- Removed the root `window.addEventListener('resize')` mobile detector from `App.tsx`; App now consumes the shared `useIsMobileViewport` path through the responsive shell hook.
- Moved lazy page declarations and the shared Suspense fallback to `src/app/appLazyPages.tsx`.
- Moved App route-query flags and snowflake route clearing to `src/app/appRouteFlags.ts`, so `App.tsx` no longer reads route search params inline.
- Moved the advanced debug panel rendering to `src/app/AppDebugPanel.tsx`; App now passes runtime/debug values as props instead of owning the render tree.
- Moved routing mute-group local persistence to `src/app/routingMuteGroupStorage.ts`, leaving Supabase storage/query/migration files untouched.
- `architecture:mobile-debug-policy` now guards against direct App resize listeners, direct mobile width thresholds, direct mobile viewport hook usage, and inline App debug-panel markup in `App.tsx`.
- Current `src/App.tsx`: 4514 non-empty LOC after this batch.

### Phase 19: App Runtime Status And Helper Batch

- Moved macOS audio output and Product Core background-audio status pill rendering to `src/app/AppRuntimeStatusPills.tsx`.
- Moved drum sequencer source preservation and preset-slot change policy to `src/app/drumSequencerSourcePolicy.ts`.
- Moved native dual-range serialization and the App dual-slider state type to `src/app/nativeDualRanges.ts`.
- `App.tsx` now composes status pill components instead of owning status render callbacks.
- Current `src/App.tsx`: 4435 non-empty LOC after this batch.

### Phase 20: App Runtime State Batch

- Moved dual-slider mode/range state, runtime-walk reset seeding, and Product Control dual-range dispatch into `src/app/useDualSliderRuntimeState.ts`.
- Moved advanced editor active-tab state, shortcut handling, accent styles, and top-level navigation handoff into `src/app/useAdvancedEditorNavigation.ts`.
- Moved drum scatter sequencer state, Product Core manual drum trigger wiring, scatter phrase playback cleanup, and visual pulse state into `src/app/useDrumScatterRuntimeState.ts`.
- Moved slider-change routing auto-enable logic, runtime enabled-flag preservation, and wetness-derived disable checks into `src/app/sliderRoutingState.ts`.
- `migration:product-boundary` now accepts the runtime-walk reset policy in the dual-slider hook while continuing to require App to consume the hook explicitly.
- Current `src/App.tsx`: 3562 non-empty LOC after this batch.

### Phase 21: Core Host Lifecycle Batch

- Added `src/audio/product/host/CoreProductHostLifecycleCoordinator.ts` for Product Core start/resume/suspend/stop/dispose sequencing.
- `coreProductEngineHost.ts` keeps the public lifecycle methods, but now delegates repeated cleanup/startup work to the coordinator.
- Updated `core:product:web-host` so lifecycle tokens and size limits include the coordinator.
- Updated the Product behavior harness so runtime-fallback checks evaluate the coordinator in the VM host fixture.
- Current `src/audio/coreProductEngineHost.ts`: 886 non-empty LOC after this batch.

### Phase 22: App Drum Morph Sync Batch

- Moved drum morph preset-change detection, mid-morph reinterpolation, dual-range interpolation replay, and Product runtime resync into `src/app/useDrumMorphPresetInterpolationSync.ts`.
- Kept the existing materialized `SliderState` and Product Control override contracts; no Supabase V2/detail/storage shape was changed.
- Updated `core:product:cpu-scenarios` so the conflict-normalization guard follows App routing policy through `src/app/sliderRoutingState.ts`.
- Current `src/App.tsx`: 3456 non-empty LOC after this batch.

## Command Results

| Command | Result | Notes |
|---|---:|---|
| `npm run type-check` | PASS | Latest Phase 22 check passed; generated `src/audio/generated/coreProductRuntimeAssetVersion.ts` first through `pretype-check`. |
| `npm run architecture:product-core-truth` | PASS | Latest run passed inside `architecture:strict`. |
| `npm run architecture:adapter-burndown` | PASS | Latest run passed inside `architecture:strict`. |
| `npm run architecture:mobile-debug-policy` | PASS | Latest run passed inside `architecture:strict`; mobile/debug policy guards the centralized App responsive shell and debug panel. |
| `npm run architecture:budget` | PASS | Warn-only budget check reports `src/App.tsx` 3456 non-empty LOC and `src/audio/coreProductEngineHost.ts` 886 non-empty LOC. |
| `npm run architecture:strict` | PASS | Latest full strict batch passed after Phases 21-22. Includes budget, truth, adapter, mobile/native policy, product boundary, runtime fallback, fail-closed policy regression, lifecycle serialization regression, web-host guard, realtime-safety, diagnostics scheduler, Product Core preset-boundary, and sample-hold feedback checks. |
| `npm run migration:product-boundary` | PASS | Latest run passed inside `architecture:strict`. Existing allowed reference loaders: `src/audio/coreEngineHost.ts`, `src/audio/referenceAudioRuntime.ts`. |
| `npm run core:product:runtime-fallbacks` | PASS | Latest run passed after wiring the lifecycle coordinator into the Product behavior harness. |
| `npm run core:product:realtime-safety` | PASS | Scanned 197 C++ render/process functions for allocation, container growth, locks, logging, exceptions, and bridge calls. |
| `npm run core:product:web-host` | PASS | Web host checks passed after extracting realtime input bootstrap, realtime timestamp mapper, frame-coalesced telemetry callback scheduler, lifecycle coordinator, sample-hold feedback policy, narrow perf callback path, state/telemetry mode gating, and sequencer visual bridge. |
| `npm run core:product:cpu` | PASS | Disabled FX: 4.87085% avg, 5.565% peak, p95 0.1424 ms, p99 0.1482 ms, missed 0. Active FX: 7.73015% avg, 8.88% peak, p95 0.2262 ms, p99 0.2368 ms, missed 0. Report: `docs/reports/kessho-product-cpu-budget-latest.md`. |
| `npm run core:product:cpu-scenarios` | PASS | CPU scenario checks passed. Report: `docs/reports/kessho-product-cpu-scenarios-latest.md`. |
| `npm run check:mac` | PASS | Basic macOS compatibility check passed with Node/npm, Xcode license, wasm script permissions, and macOS Rollup/esbuild package checks clean. |
| `npm run native:bridge:test` | PASS | Swift package tests passed: 7 tests, 0 failures. |
| `swift build --package-path CapacitorMac` | PASS | macOS Swift package builds with shared `KesshoNativeBridge` dependency. |
| `npm run core:product:ios-audio-session` | PASS | Existing static iOS audio-session gate passed. |
| `npm run test:product-diagnostics-scheduler` | PASS | Frame scheduler regression passed for diagnostic burst coalescing, immediate invalidation, and hidden-tab timers. |
| `npm run test:product-preset-boundary` | PASS | Product Core preset-boundary regression passed for normalized materialized preset state and invalid boundary rejection. |
| `npm run test:product-sample-hold-feedback` | PASS | Sample-hold feedback regression passed for callback-gated payload publication with trigger counters still advancing. |
| `npm run test:product-runtime-policy` | PASS | New fail-closed runtime policy regression passed. |
| `npm run test:product-runtime-lifecycle` | PASS | New serialized lifecycle controller regression passed. |
| `node scripts/check-kessho-product-running-sequencer-live-updates.mjs` | PASS | Running step callback registration keeps current playhead behavior after the visual bridge split. |

## Skipped / Deferred

- iOS simulator/device background-audio validation was not run in this local pass.
- macOS app smoke commands such as `core:product:macos-app-native-smoke` and `core:product:macos-app-background-smoke` were not run; this phase used `check:mac`, `native:bridge:test`, and `swift build --package-path CapacitorMac` as local native checks.
- `swift build --package-path plugins/kessho-capacitor-audio-session` was attempted but failed before plugin compilation because the standalone SwiftPM invocation could not resolve the `Capacitor` module from the cached binary artifact in this environment. The repo's static `core:product:ios-audio-session` gate passed; full iOS project build remains device/Xcode validation.
- Supabase storage, query, migration, egress, cleanup, RLS, and V2 cloud contract tests were intentionally not run or fixed here.
- Full architecture strict, CPU, CPU scenario, and local native/static checks were rerun after Phases 21-22.
- The combined Supabase + architecture suite remains owned by the final integrator after both workstreams are merged.

## Cross-Workstream Notes

- Existing dirty Supabase-owned files were present during this run and were left to the Supabase workstream.
- `package.json` contains both Supabase workstream script additions and the new architecture scripts; neither set was renamed or removed.
