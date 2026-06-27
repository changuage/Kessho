# Pre-Sampler Hardening Results

## Baseline
- Git commit: 5f3e850e6932be1e2acae0e1b9a8de68bf486c0e
- Date: 2026-06-27T23:03:21Z
- Node version: v24.14.1
- npm version: 11.11.0
- macOS/iOS environment availability: macOS 15.7.4 / Darwin 24.6.0 available; iPhone 17 iOS Simulator 26.3.1 available and used
- Supabase env availability: `.env.local` contains Supabase runtime/database credentials; values not printed

## Phase Results
| Phase | Status | Commands run | Notes |
|---|---:|---|---|
| Baseline | COMPLETE_WITH_REFRESH | `npm ci`; `npm run type-check`; `npm run architecture:strict`; `npm run core:product:cpu`; `npm run core:product:cpu-scenarios`; Supabase/native optional baseline commands | Initial `core:product:cpu-scenarios` failed only because granular/reverb evidence was older than 72h. `core:product:granular-artifacts` and `core:product:reverb-tail-quality` refreshed the evidence; final scenario gate passes. |
| Phase A native/device proof | COMPLETE | `npm run check:mac`; `npm run native:bridge:test`; `swift build --package-path CapacitorMac`; `npm run core:product:ios-audio-session`; `npm run core:product:ios-simulator-smoke`; `npm run core:product:ios-background-audio-smoke`; `npm run core:product:macos-app-native-smoke`; `npm run core:product:macos-app-background-smoke`; `npm run native:device-proof` | macOS runtime smoke/background proof passed. iOS simulator app build/launch, Product Core start/probe, route-change/interruption, background/foreground, and protected-data lifecycle smoke passed. |
| Phase B Supabase edge proof | COMPLETE | `npm run type-check`; `npm run test:cloud-preset-edge`; `npm run audit:cloud-cursors`; `npm run audit:cloud-pagination`; `npm run audit:cloud-play-increment`; `npm run audit:cloud-save-v2`; `npm run audit:supabase-egress`; `npm run audit:supabase-egress:runtime`; `npm run audit:supabase-egress:runtime:detail:strict`; `npm run audit:supabase-egress:runtime:detail:repeat`; preset and Supabase regression suite | Cursor validation, owner-scoped public save identity, post-success play marker, verified payload cache reads, and 24-row runtime list budget are implemented. Migration SQL rollback validation passed through `pg`; `psql` CLI is unavailable. |
| Phase C size budget proof | COMPLETE | `npm run architecture:budget:strict`; `npm run architecture:strict` | Strict no-growth ceilings are enforced for large architecture files. Current files remain above target ceilings and warn, but any growth over the captured ceilings fails. |
| Phase D adapter burn-down proof | COMPLETE | `npm run architecture:adapter-burndown:strict`; `npm run architecture:strict` | Broad Product adapter compatibility growth is guarded; sampler-specific host logic must use focused ports/Product events. |
| Phase E runtime scheduler proof | COMPLETE | `npm run architecture:runtime-scheduler`; `npm run test:product-diagnostics-scheduler`; `npm run architecture:strict` | Runtime-scoped scheduling now owns telemetry/diagnostics channel policy and hidden/mobile coalescing. |
| Phase F lifecycle matrix proof | COMPLETE | `npm run test:product-runtime-lifecycle`; `npm run architecture:strict` | Lifecycle state matrix rejects illegal transitions, keeps operations serialized, and exposes the last rejected transition reason in diagnostics. |
| Phase G sampler gate update | COMPLETE | sampler plan edited; `npm run type-check`; final Section 10 gate commands | Sampler plan now allows only Phase 0-2 before this report passes and requires `POST_SAMPLER_HARDENING_RESULTS.md` after Phase 7. |

## Native/device proof

Native proof file:

```text
docs/reports/native-device-proof-latest.md
PASS - structurally complete and includes commit, OS, macOS runtime smoke, iOS simulator runtime smoke, and known issues.
```

Command output:

```text
npm run check:mac
PASS - Basic macOS checks passed.

npm run native:bridge:test
PASS - 7 KesshoNativeBridge tests passed, including malformed payload rejection.

swift build --package-path CapacitorMac
PASS - Build complete.

npm run core:product:ios-audio-session
PASS - Kessho iOS audio session check passed (static).

npm run core:product:ios-simulator-smoke
PASS - Kessho iOS simulator foreground smoke passed; mode=foreground sampleRate=48000.000000 bufferMs=2.666667 peak=0.002725 rms=0.001307 renderedFrames=8192 rendererStartCount=1 routeChangeCount=1 interruptionBeginCount=1 interruptionEndCount=1.

npm run core:product:ios-background-audio-smoke
PASS - Kessho iOS simulator background smoke passed; mode=background sampleRate=48000.000000 bufferMs=2.666667 peak=0.002725 rms=0.001307 renderedFrames=8192 rendererStartCount=1 routeChangeCount=1 interruptionBeginCount=1 interruptionEndCount=1 backgroundCount=1 foregroundCount=1 protectedDataUnavailableCount=1 protectedDataAvailableCount=1.

npm run core:product:macos-app-native-smoke
PASS - Kessho Capacitor macOS native Product Core diagnostics smoke passed.

npm run core:product:macos-app-background-smoke
PASS - Kessho Capacitor macOS native Product Core background smoke passed.

npm run native:device-proof
PASS - Native device proof file is present and structurally complete.
```

Native limitation:

```text
Physical iOS device screen-lock/audio-route proof was not run in this local pass. The pre-sampler native runtime gate is covered by the iOS simulator app build/launch plus foreground/background native Product Core smoke.
```

## Supabase edge proof

Implemented hardening:

```text
- Cloud cursors now use base64-encoded structured payloads with validated UUID, ISO date, and play-count fields.
- Legacy cursor decoding is retained only as a decode fallback.
- Public save identity is scoped to the authenticated anonymous session instead of reusing another public owner's id.
- Play-count local marker is written only after a successful Supabase RPC.
- Persistent payload-cache reads verify canonical hashes once per session before trusting cached payloads.
- Runtime fresh-load summary list budget now requests 24 rows instead of 50.
- ADR added: docs/adr/0006-public-cloud-preset-identity.md.
- Migration added: supabase/migrations/20260627221646_public_preset_owner_identity.sql.
```

Command output:

```text
npm run test:cloud-preset-edge
PASS - cursor parser, public save identity, play marker, and verified payload-cache regression passed.

npm run audit:cloud-cursors
PASS - Cloud cursor/list budget guard passed.

npm run audit:cloud-pagination
PASS - Cloud pagination guard passed.

npm run audit:cloud-play-increment
PASS - Cloud play increment guard passed.

npm run audit:cloud-save-v2
PASS - Cloud save V2 contract passed.

npm run audit:supabase-egress
PASS - Supabase egress guard passed.

npm run audit:supabase-security
PASS - Supabase security guard passed.

npm run audit:supabase-api-surface -- --require-detail-rpcs --require-runtime-rpcs --require-summary-views --fail-open-base-tables
PASS - summary views callable, base REST blocked/empty, detail/runtime RPCs callable, broad base-table SELECT grants: 0.

npm run audit:supabase-revoke-readiness
PASS - runtime direct base-table touchpoints: 0; browser maintenance direct base-table touchpoints: 0; Node maintenance direct base-table touchpoints remain maintenance-only.

npm run audit:preset-v2 -- --fail-on-issues
PASS - blocking integrity issues: 0; duplicate active logical identities: 0.

npm run audit:supabase-egress:runtime
PASS - fresh-load calls=4 total=15.3 KB; summary list request used limit=24.

npm run audit:supabase-egress:runtime:detail:strict
PASS - fresh-load calls=4 total=15.3 KB; load-first-preset calls=3 total=98.1 KB; summary list request used limit=24.

npm run audit:supabase-egress:runtime:detail:repeat
PASS - fresh-load calls=4 total=15.3 KB; reload-load-first-preset average calls=10 total=56.6 KB avg=28.3 KB; summary list request used limit=24.

npm run audit:supabase-optimization-db-proof
PASS - duplicate payload proof, narrow RPCs, bad/missing hash rejection, purge dry-run, and rollback proof passed.

npm run maintenance:preset-v2:postgres
PASS - dry run completed; no payload prune; materialize warnings recorded.

node/pg rollback migration validation
PASS - supabase/migrations/20260627221646_public_preset_owner_identity.sql executed inside begin/rollback.
```

Note:

```text
One concurrent run of audit:supabase-egress:runtime:detail:repeat failed with "Could not find the Presets button" while the strict probe was running in parallel. The same command passed when rerun sequentially.
```

## Size budget proof

Files and no-growth ceilings:

```text
src/App.tsx: no-growth ceiling 3456, target 2500
src/audio/coreProductEngineHost.ts: no-growth ceiling 886, target 650
src/presets/SupabasePresetStore.ts: no-growth ceiling 2257, target 1200
src/cloud/supabase.ts: no-growth ceiling 802, target 500
src/presets/presetStorageV2.ts: no-growth ceiling 981, target 600
```

Command output:

```text
npm run architecture:budget:strict
PASS - Strict architecture size budget passed.
WARN - tracked files remain above target ceilings, so future split work is still needed.

npm run architecture:strict
PASS - strict budget is wired into the full architecture suite.
```

## Adapter burn-down proof

Command output:

```text
npm run architecture:adapter-burndown:strict
PASS - Product adapter burn-down strict guard passed.

npm run architecture:strict
PASS - strict adapter burn-down is wired into the full architecture suite.
```

Guard coverage:

```text
- Blocks new broad compatibility methods on ProductEnginePort.
- Blocks sampler-specific logic in WebProductEngine beyond focused port forwarding.
- Blocks growth in legacy host adapter shims without explicit guard updates.
```

## Runtime scheduler proof

Implemented scheduler:

```text
src/audio/product/scheduling/ProductRuntimeScheduler.ts
```

Channels:

```text
visible-visuals
telemetry-visible
telemetry-hidden
diagnostics-visible
diagnostics-hidden
midi-activity
perf-overlay
sample-cache-diagnostics
sample-asset-miss-diagnostics
sample-decode-progress
```

Command output:

```text
npm run architecture:runtime-scheduler
PASS - Product runtime scheduler guard passed.

npm run test:product-diagnostics-scheduler
PASS - Product diagnostics publisher regression passed.

npm run architecture:strict
PASS - runtime scheduler guard is wired into the full architecture suite.
```

Notes:

```text
- ProductDiagnosticsPublisher and CoreProductTelemetryCallbackScheduler consume ProductRuntimeScheduler.
- ProductFrameScheduler now supports dispose and clears pending callbacks.
- ProductDiagnosticsPublisher no longer constructs its own ProductFrameScheduler.
- WebProductEngine owns one runtime scheduler per Product runtime instance.
```

## Lifecycle matrix proof

Implemented matrix:

```text
src/audio/product/lifecycle/ProductRuntimeLifecycleState.ts
src/audio/product/lifecycle/ProductRuntimeLifecycleController.ts
```

Command output:

```text
npm run test:product-runtime-lifecycle
PASS - Product runtime lifecycle controller regression passed.

npm run architecture:strict
PASS - lifecycle matrix regression is wired into the full architecture suite.
```

Notes:

```text
- States: cold, preloading, ready, starting, running, suspending, suspended, stopping, stopped, failed, disposed.
- Intents: preload, start, resume, suspend, stop, dispose, fail.
- Illegal or duplicate intents no-op and record lastRejectedTransitionReason.
- ProductRuntimeDiagnostics includes lastRejectedLifecycleTransitionReason.
- Production Product Core fail-closed policy remains intact; no web-ts fallback was introduced.
```

## Final pre-render gate

Section 10 command output:

```text
npm run type-check
PASS - tsc --noEmit.

npm run architecture:budget:strict
PASS - Strict architecture size budget passed.

npm run architecture:adapter-burndown:strict
PASS - Product adapter burn-down strict guard passed.

npm run architecture:runtime-scheduler
PASS - Product runtime scheduler guard passed.

npm run architecture:strict
PASS - Product Core truth, strict size budget, strict adapter burn-down, runtime scheduler, mobile debug policy, migration boundary, runtime fallbacks, runtime policy, lifecycle, web-host, realtime safety, diagnostics scheduler, preset boundary, and sample-hold feedback checks passed.

npm run core:product:cpu
PASS - disabled FX 4.9578% avg, 5.79% peak, p95 0.1444 ms, p99 0.1496 ms, missed 0; active FX 7.7577% avg, 9.2925% peak, p95 0.2292 ms, p99 0.2392 ms, missed 0.

npm run core:product:cpu-scenarios
PASS - Kessho Product CPU scenario checks passed.

npm run audit:cloud-cursors
PASS - Cloud cursor/list budget guard passed.

npm run audit:supabase-egress
PASS - Supabase egress guard passed.

npm run audit:supabase-egress:runtime:detail:strict
PASS - fresh-load calls=4 total=15.3 KB; load-first-preset calls=3 total=98.1 KB.

npm run audit:supabase-egress:runtime:detail:repeat
PASS - reload-load-first-preset average calls=10 total=56.6 KB avg=28.3 KB.

npm run native:device-proof
PASS - Native device proof file is present and structurally complete.

git diff --check
PASS - no whitespace errors.
```

Pre-render gate checklist:

```text
[x] Native/device proof report exists and is structurally complete.
[x] Supabase cursor and play-count edge guards pass.
[x] Public cloud save identity decision is documented.
[x] Payload cache verifies persistent entries once per session.
[x] Strict size budget fails on growth.
[x] Adapter burn-down strict guard passes.
[x] Runtime scheduler singleton/injection guard passes.
[x] Lifecycle state matrix tests pass.
[x] CPU baseline recorded after scheduler/lifecycle changes.
[x] Sampler plan is updated with Phase 3 gate.
```

Gate status:

```text
Sampler Phase 3 is: READY

Reason:
All Section 10 commands pass. Native runtime proof now includes macOS app smoke/background smoke and iOS simulator app build/launch with foreground/background native Product Core smoke, so the earlier owner-approval exception path is no longer needed.
```
