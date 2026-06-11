# Product-Core State Authority Ledger

## Baseline

| Item | Status | Evidence |
|---|---|---|
| branch/head recorded | complete | `main` at `7dc9e6e7`. |
| web-ts untouched | current-tree dirty | Historical Batch 0 had no web-ts diff. Current verification returns `src/audio/reference/webTs/engine.ts`; this verification did not edit web-ts, and production no-web-ts bundle isolation still passes. |
| ProductEngineProxy production path | recorded | Product path uses `src/audio/product/ProductEnginePort.ts`, `src/audio/product/WebProductEngine.ts`, and `src/audio/coreProductEngineHost.ts`; baseline checks passed. |
| root `src/audio/engine.ts` absent or non-production | complete | `git ls-files src/audio/engine.ts src/audio/runtime.ts` produced no files. |
| root `src/audio/runtime.ts` absent or non-production | complete | `git ls-files src/audio/engine.ts src/audio/runtime.ts` produced no files. |
| current running-sequencer bugs reproduced | recorded | `src/ui/useAudioEngineParamSync.ts` still uses a 33 ms Product patch batching path; manual triggers in `src/ui/useSelectedAudioEngineManualTriggers.ts` pass ad hoc `externalState`; Product host manual paths in `src/audio/coreProductEngineHost.ts` write that external state directly. |
| ratchet cross-block bug reproduced | recorded | `cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp` only emits ratchets whose computed subhit sample is inside the same block as the parent step; there is no pending ratchet state in `LaneState`. Later subhits are skipped when `ratchet_sample >= block_end`. |

## Current Bug Records

| Bug | Status | Evidence / Reproduction |
|---|---|---|
| synth parameter changes do not audibly affect sound while sequencer is running | recorded | Source-level reproduction: Product patches are delayed by `CORE_PRODUCT_PARAM_UPDATE_INTERVAL_MS = 33` in `src/ui/useAudioEngineParamSync.ts`, and there is no committed revision barrier before sequencer triggers. |
| preset load does not audibly affect sound while sequencer is running | recorded | Source-level reproduction: `src/ui/usePresetEngineSync.ts` routes preset state through `scheduleAudioEngineParamUpdate`; no atomic preset-load transaction or trigger-before-commit guard exists yet. |
| preset morph / morph sub-sequencer is stale or inconsistent | recorded | Source-level reproduction: morph and sub-lane data still have separate host/UI patch paths (`applySequencerUiPatch`, per-event morph/distance/expression in Product sequencer) instead of one resolved UI/Product state. |
| ratchet does not emit all subhits | recorded | Source-level reproduction: ratchet subhits are generated and discarded inside one parent-step block in `SynthEuclidSequencer.cpp`; no pending queue exists for future blocks. |
| manual audition immediately after slider drag can play stale state | recorded | Source-level reproduction: manual trigger hooks pass current UI `externalState`, but there is no resolved-state commit receipt before `auditionSynthNote` or `triggerDrumVoice`. |

## Batch Status

| Batch | Status | Validation | Notes |
|---|---|---|---|
| 0 Baseline proof | complete | `npm run type-check`: pass; `npm run migration:product-boundary`: pass; `npm run core:product:reference-isolation`: pass | Guardrails and current bugs recorded. |
| 1 Ratchet scheduler fix | complete | `npm run type-check`: pass; `npm run core:product:sequencer`: pass; `npm run core:product:determinism`: pass; `npm run core:product:browser-runtime`: pass | Bounded pending ratchet queue drains subhits across audio blocks; stop, reset, snapshot reload, and timing changes clear pending subhits. |
| 2 ResolvedPerformanceState resolver | complete | `npm run core:product:resolved-state`: pass; `npm run type-check`: pass; `npm run core:product:patch-bridges`: pass; `npm run core:product:dirty-diff`: pass | Pure product-control reducer/resolver exists with revision semantics and unit coverage. |
| 3 Revisioned product commit barrier | complete | `npm run type-check`: pass; `npm run core:product:resolved-state`: pass; `npm run core:product:patch-bridges`: pass; `npm run core:product:dirty-diff`: pass; `npm run core:product:snapshot-authority`: pass; `npm run core:product:runtime-fallbacks`: pass; `npm run core:product:getter-policies`: pass | ProductEnginePort commit API, host receipt, revision diagnostics, commit helper, and manual trigger commit-before-trigger path added. |
| 4 Atomic preset/morph/endpoint transactions | complete | `npm run type-check`: pass; `npm run core:product:resolved-state`: pass; `npm run core:product:snapshot-authority`: pass; `npm run core:product:runtime-fallbacks`: pass; `npm run core:product:getter-policies`: pass | Detailed Batch 4 report below; current verification kept the commit/snapshot authority gates green. |
| 5 Sequencer patch bridge and hidden authority cleanup | complete | `npm run core:product:patch-bridges`: pass; `npm run core:product:dirty-diff`: pass; `npm run core:product:host-reconciliation`: pass; `npm run core:product:browser-runtime`: pass | Detailed Batch 5 report below; revisioned bridge and dirty-diff policy gates pass. |
| 6 Running-sequencer interaction gate | complete | `npm run core:product:running-sequencer-live-updates`: pass; `npm run core:product:sequencer`: pass; `npm run core:product:determinism`: pass | Detailed Batch 6 report below; current live-update report is fresh. |
| 7 Final state-authority signoff | functionally complete; strict web-ts clean-tree not clean | State-authority functional matrix passed; `git diff --name-only -- src/audio/reference/webTs` currently returns `src/audio/reference/webTs/engine.ts` | API stability gates pass. Strict final signoff needs the current web-ts dirty diff resolved by its owner. |

## Batch 0 Report

Batch:
- 0 Baseline proof

Agent:
- primary implementation session

Changed files:
- `docs/product-core/state-authority-ledger.md`

Existing dirty files modified:
- none

web-ts touched:
- no

Behavior changes:
- none

Validation run:
- `git rev-parse --short HEAD`: pass (`7dc9e6e7`)
- `git status --short`: pass (dirty worktree recorded)
- `git diff --name-only -- src/audio/reference/webTs`: pass (no output)
- `git ls-files src/audio/engine.ts src/audio/runtime.ts`: pass (no output)
- `npm run type-check`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass

Manual/audio tests:
- running sequencer audible parameter update: not run; baseline source-level bug recorded
- preset load while running: not run; baseline source-level bug recorded
- morph/sub-sequencer stale state: not run; baseline source-level bug recorded
- ratchet cross-block: not run; baseline source-level bug recorded
- manual audition after slider drag: not run; baseline source-level bug recorded

Batch exit criteria:
- complete

State-authority invariant status:
- still broken; baseline confirms delayed patching, manual external state, and same-block-only ratchets remain

Parallel coordination notes:
- `src/audio/reference/webTs/**` remains read-only.
- Batch 1 should own `cpp/KesshoCore/src/product/sequencer/*`, `cpp/KesshoCore/src/product/ProductSequencerState.h`, and focused sequencer tests.

Next batch:
- 1 Ratchet scheduler fix

## Batch 1 Report

Batch:
- 1 Ratchet scheduler fix

Agent:
- primary implementation session

Changed files:
- `cpp/KesshoCore/src/product/ProductSequencerState.h`
- `cpp/KesshoCore/src/product/ProductState.h`
- `cpp/KesshoCore/src/product/sequencer/SequencerEventBuffer.cpp`
- `cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp`
- `cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp`
- `cpp/KesshoCore/src/product/KesshoProductEvents.cpp`
- `cpp/KesshoCore/tests/ProductSequencerTests.cpp`
- `docs/product-core/state-authority-ledger.md`

Existing dirty files modified:
- none

web-ts touched:
- no

Behavior changes:
- Synth and drum sequencer ratchets now enqueue resolved parent subhits and drain them by absolute sample across future audio blocks.
- Ratchet probability, trig condition, voice/note, morph, distance, and expression decisions remain parent-step decisions and are not re-evaluated per future block.
- Pending ratchets are cleared on lane runtime reset, transport stop, snapshot reload, engine reset, and tempo/timing-affecting changes.
- If a lane pending queue overflows, the oldest pending subhit is dropped and the internal drop counter increments.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:determinism`: pass
- `npm run core:product:browser-runtime`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass (no output)

Manual/audio tests:
- audible running-sequencer ratchets: not run; covered by C++ debug-render event tests and browser-runtime gate
- browser runtime smoke: pass via `npm run core:product:browser-runtime`

Batch exit criteria:
- complete

State-authority invariant status:
- partially repaired; ratchet subhits now use one parent-resolved state across blocks, but preset/morph/manual trigger state authority remains broken until Batches 2-6

Parallel coordination notes:
- Batch 1 changed C++ sequencer runtime state and tests.
- Avoid concurrent edits to `cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp`, `cpp/KesshoCore/src/product/ProductSequencerState.h`, and `cpp/KesshoCore/tests/ProductSequencerTests.cpp` until downstream batches account for the pending queue model.

Next batch:
- 2 ResolvedPerformanceState resolver

## Batch 2 Report

Batch:
- 2 ResolvedPerformanceState resolver

Agent:
- primary implementation session

Changed files:
- `src/product-control/ProductControlState.ts`
- `src/product-control/ProductControlActions.ts`
- `src/product-control/ProductStateRevision.ts`
- `src/product-control/buildResolvedProductPatch.ts`
- `src/product-control/controlReducer.ts`
- `src/product-control/resolvePerformanceState.ts`
- `src/product-control/index.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `scripts/run-product-control-resolved-state-regression.mjs`
- `package.json`
- `docs/product-core/state-authority-ledger.md`

Existing dirty files modified:
- none

web-ts touched:
- no

Behavior changes:
- No runtime behavior is wired yet.
- Added a pure product-control reducer and resolver that compute visible resolved sliders, product patch, revision, reason, and trigger-critical metadata from one control state.
- Preset load resets both morph endpoints to the loaded state; morph endpoint replacement and endpoint edits recompute through the resolver; midpoint edits are either rejected or stored as visible midpoint overrides.

Validation run:
- `npm run core:product:resolved-state`: pass
- `npm run type-check`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass (no output)

Manual/audio tests:
- not run; Batch 2 is pure state-resolution code with unit coverage and no runtime wiring

Batch exit criteria:
- complete

State-authority invariant status:
- structurally improved but not enforced at runtime yet; triggers still need a commit barrier and UI transaction routing in Batches 3-6

Parallel coordination notes:
- `src/product-control/*` is now the Batch 2 type surface for downstream commit barrier and UI transaction work.
- Avoid reshaping `ResolvedPerformanceState` without coordinating Batch 3 commit receipt types.

Next batch:
- 3 Revisioned product commit barrier

## Batch 3 Report

Batch:
- 3 Revisioned product commit barrier

Agent:
- primary implementation session

Changed files:
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/ProductEnginePort.ts`
- `src/audio/product/ProductRuntimeDiagnostics.ts`
- `src/audio/product/WebProductEngine.ts`
- `src/audio/product/host/CoreProductRuntimeHostPort.ts`
- `src/audio/product/host/CoreProductHostDiagnostics.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineManualTriggers.ts`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/index.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `docs/product-core/state-authority-ledger.md`

Existing dirty files modified:
- none

web-ts touched:
- no

Behavior changes:
- Product runtime exposes `commitResolvedState()` and `getCommittedStateRevision()`.
- Core Product host records resolved, committed, and triggered revisions plus commit mode and trigger-before-commit counters.
- Manual synth and drum triggers in the core-product UI path now resolve current visible slider state, commit it, and then trigger without using normal-operation `externalState`.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass (no output)

Manual/audio tests:
- manual note/drum audition after slider drag: not manually auditioned; commit helper and manual trigger hook ordering are covered by TypeScript regression and type-check

Batch exit criteria:
- complete

State-authority invariant status:
- improved for manual trigger paths; running sequencer, preset/morph transactions, and sequencer patch bridges still need routing through the resolved-state commit model

Parallel coordination notes:
- Commit API and `ResolvedPerformanceState` helper are ready for Batch 4 UI transaction wiring.
- Avoid concurrent shape changes to `ProductEnginePort`, `WebProductEngine`, `CoreProductRuntimeHostPort`, `coreProductEngineHost`, and `src/product-control/*`.

Next batch:
- 4 Atomic preset/morph/endpoint transactions

## Batch 4 Report

Batch:
- 4 Atomic preset/morph/endpoint/drum-morph transactions

Agent:
- primary implementation session

Changed files:
- `src/product-control/commitResolvedState.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `src/ui/useAudioEngineParamSync.ts`
- `src/ui/usePresetEngineSync.ts`
- `src/ui/useProductRuntimePresetSurface.ts`
- `src/ui/useMorphPositionRuntimeSurface.ts`
- `src/ui/useMorphSlotLoadRuntimeSurface.ts`
- `src/App.tsx`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- `docs/product-core/state-authority-ledger.md`

Existing dirty files modified:
- `scripts/check-kessho-product-dirty-diff-classification.mjs`

web-ts touched:
- no

Behavior changes:
- Product Core preset and morph transactions now route visible slider state through a resolved-state commit helper with the next committed Product revision.
- Preset load remains the allowed full-snapshot transaction and is explicitly trigger-critical.
- Manual morph changes, auto morph ticks, and mid-morph endpoint replacement now commit immediately instead of waiting behind the UI batching timer.
- Loading morph slot A/B during a midpoint morph recomputes the interpolated visible state in the slot-load handler, updates dual runtime state, and commits that exact resolved state.
- Drum preset changes during mid drum morph now accumulate one recomputed visible drum morph state and commit it immediately.
- Dirty-diff policy validation now accepts resolved commits for trigger-critical transactions while still requiring changed-key patches for non-critical UI updates.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:browser-runtime`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass (no output)

Manual/audio tests:
- not run; covered by state resolver regression, TypeScript, policy checks, snapshot authority, and browser runtime checks in this batch

Batch exit criteria:
- complete

State-authority invariant status:
- holds for patched preset-load, manual morph, auto morph, morph endpoint replacement, and mid drum-morph preset-change transactions.
- not globally signed off yet; sequencer patch bridges, remaining hidden state authorities, and running-sequencer live update gates remain Batch 5-6 work.

Parallel coordination notes:
- Avoid concurrent edits to `src/ui/useAudioEngineParamSync.ts`, `src/ui/useMorphPositionRuntimeSurface.ts`, `src/ui/useMorphSlotLoadRuntimeSurface.ts`, `src/App.tsx`, and `src/product-control/commitResolvedState.ts` until Batch 5 accounts for the resolved commit helper.
- `src/audio/drumMorph.ts` module-level override state was not moved in this batch; Batch 5 should replace or harden that hidden authority for the product-core path.

Next batch:
- 5 Replace or harden sequencer patch bridges and hidden state authorities

## Batch 5 Report

Batch:
- 5 Sequencer patch bridges and hidden authority cleanup

Agent:
- primary implementation session

Changed files:
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/ProductRuntimeDiagnostics.ts`
- `src/audio/product/host/CoreProductHostDiagnostics.ts`
- `src/audio/product/host/CoreProductSequencerUiPatchBridge.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `src/audio/drumMorph.ts`
- `src/App.tsx`
- `docs/product-core/state-authority-ledger.md`

Existing dirty files modified:
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/ProductRuntimeDiagnostics.ts`
- `src/audio/product/host/CoreProductHostDiagnostics.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/App.tsx`

web-ts touched:
- no

Behavior changes:
- Product sequencer UI compatibility patches now carry a monotonic UI revision allocated at the UI bridge call site.
- Core Product host diagnostics now records sequencer UI patch count, patch kind, requested revision, and applied revision.
- The temporary sequencer UI patch bridge remains, but it is revision-visible and measurable for UI/host/runtime cache consistency checks.
- Drum morph override storage now has an authority revision counter.
- Drum synth parameter edits that mutate drum morph override authority now commit the resulting visible slider state immediately through the resolved-state barrier.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:browser-runtime`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass (no output)
- extra non-batch check `npm run core:product:web-host`: fail on existing `coreProductEngineHost.ts` line-count cap; not pursued because broad host cleanup is outside this batch

Manual/audio tests:
- not run; Batch 5 used policy, diagnostics, browser runtime, and state regression coverage

Batch exit criteria:
- complete for hardening: temporary sequencer bridges are revisioned, hidden drum morph authority mutations are revisioned and paired with resolved visible-state commits.
- generated ProductEvent replacement for every sequencer patch bridge remains future work.

State-authority invariant status:
- improved for sequencer UI patch visibility and drum morph override edits.
- not globally signed off yet; Batch 6 must prove running-sequencer live updates with automated gates.

Parallel coordination notes:
- `ProductSequencerUiPatch` now has optional `revision`; sequencer bridge callers should preserve or allocate it.
- `ProductRuntimeDiagnostics` has new sequencer UI revision fields; downstream browser/runtime checks can assert patch application order.
- `src/audio/drumMorph.ts` still owns compatibility override storage, now with an explicit authority revision; future work can move it into `ProductControlState` or another owned runtime model.

Next batch:
- 6 Running-sequencer live-update gate

## Batch 6 Report

Batch:
- 6 Running-sequencer live-update gate

Agent:
- primary implementation session

Changed files:
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `package.json`
- `docs/product-core/state-authority-ledger.md`

Generated reports:
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.json`
- `docs/reports/kessho-product-running-sequencer-live-updates-latest.md`

web-ts touched:
- no

Behavior changes:
- Added `npm run core:product:running-sequencer-live-updates`.
- The new gate verifies state-authority diagnostics, commit-before-trigger enforcement, trigger-critical preset/morph routing, mid-morph slot atomicity, sequencer UI patch revisions, running arrangement updates after committed state changes, drum morph authority hardening, and ratchet cross-block regression coverage.
- No runtime behavior changes beyond Batch 5 hardening; Batch 6 adds automated proof/reporting.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:browser-runtime`: pass
- `npm run migration:runtime-production-gates`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass (no output)

Manual/audio tests:
- not run; browser runtime smoke passed, but the new running-sequencer gate is a diagnostics/source-policy gate rather than rendered-audio comparison

Batch exit criteria:
- complete

State-authority invariant status:
- automated gate exists and passes for the repaired state-authority paths.
- final full signoff remains Batch 7.

Parallel coordination notes:
- The new gate should be kept in the final signoff set when future Product sequencer or morph authority changes land.
- Report files are generated under `docs/reports`; current status output does not show them as tracked changes.

Next batch:
- 7 Final state-authority signoff

## Batch 7 Report

Batch:
- 7 Final state-authority signoff

Agent:
- primary implementation session

Changed files:
- `scripts/check-product-engine-boundary.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- No runtime behavior changes in Batch 7.
- Product boundary policy now recognizes the revisioned sequencer UI patch helper, trigger-critical morph scheduling, atomic mid-morph slot replacement imports, and `commitThenTrigger` manual trigger ordering.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:determinism`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:browser-runtime`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `git diff -- src/audio/reference/webTs`: historical Batch 7 pass (no output); current verification status is recorded in the addendum below.

Source leftover classification:
- `externalState`: remains in Product port/host method signatures and reference/manual trigger fallback calls. Core-product manual triggers commit current resolved state first and call Product triggers without `externalState`.
- `applySequencerUiPatch`: remains as a ticketed compatibility bridge, now revisioned and diagnostics-visible. Generated ProductEvent replacement remains future hardening, but running-state correctness is covered by the revisioned bridge and live-update gate.
- per-event `morph` / `distance` / `expression`: remains explicit sequencer modulation state in Product sequencer lanes and debug telemetry. It is not used as a hidden preset fallback; visible state transactions now commit resolved slider state before trigger-critical paths.

Manual/audio tests:
- no manual audition performed; browser runtime smoke passed and C++ sequencer/determinism tests passed

Batch exit criteria:
- complete

State-authority invariant status:
- signed off for this repair pass.
- Every repaired trigger-critical UI transaction commits one resolved visible slider state before triggers; ratchets drain across block boundaries; sequencer compatibility patches are revision-visible; running-sequencer live-update gate passes; web-ts remained untouched during Batch 7.

Parallel coordination notes:
- Do not remove `ProductSequencerUiPatch.revision` or the running-sequencer gate when replacing compatibility bridges with generated events.
- Future generated-event work should preserve diagnostics fields `lastSequencerUiRevision` and `lastAppliedSequencerUiRevision` or replace them with stronger runtime event revision telemetry.

Next batch:
- none; state-authority repair signoff complete

## Current Verification Addendum - 2026-06-05

Result:
- State-authority API stability gates pass on the current tree.
- The top summary table has been reconciled with the detailed Batch 4-7 reports.
- Strict clean-tree web-ts signoff is not clean: `git diff --name-only -- src/audio/reference/webTs` returns `src/audio/reference/webTs/engine.ts`. This verification did not edit web-ts.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:browser-runtime`: pass after rebuilding stale `dist`
- `npm run core:product:abi`: pass
- `npm run core:product:determinism`: pass
- `npm run migration:runtime-production-gates`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:no-web-ts-bundle`: pass, 35 production JS assets scanned

State-authority invariant status:
- Functionally stable for the repaired API surface: resolved state, commit barrier, snapshot authority, running-sequencer live updates, ratchet scheduling, revisioned bridge policy, runtime fallback policy, getter policy, browser runtime, ABI, and determinism all pass.
- Strict final signoff remains blocked only by the current web-ts dirty-tree guardrail unless that diff is accepted as unrelated/pre-existing by the owner.

## Post-Signoff Sequencer Morph Latch Repair - 2026-06-05

Changed files:
- `src/ui/useSelectedAudioEngineLiveTriggerCallbacks.ts`
- `src/ui/synth/SynthPage.tsx`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Sequencer morph feedback inactive sentinels no longer clear latched runtime morph values for Lead 1/2, Pad 1/2, or drum voice morph sliders while playback is running.
- Sequencer-triggered morph slider positions now hold until a later trigger publishes a new morph value or the callback lifecycle cleanup runs.
- Pad/Lead preset endpoint changes no longer clear sequencer-owned runtime morph latches, so changing an endpoint while a sequencer morph sub-lane is active preserves the resolved morph state.
- Running-sequencer live-update gate now checks this latch rule so inactive morph feedback cannot regress to snapback behavior.
- Lead dry routing was not changed; focused native and browser graph checks confirmed sequenced Lead 1/2 dry output reaches Product Core output.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:graph`: pass
- `npm run core:product:sequencer-routing-smoke`: pass
- `npm run core:product:reference-isolation`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- no manual audition performed
- automated browser graph smoke passed sequenced Lead 1/2 dry routing

Batch exit criteria:
- post-signoff bugfix complete

State-authority invariant status:
- maintained. Sequencer-triggered visible runtime slider values now remain one resolved latched state between triggers instead of being cleared by inactive feedback.

Parallel coordination notes:
- Do not reintroduce runtime value removal inside inactive sequencer morph callbacks. Cleanup should stay in effect unmount/registration cleanup paths.

Next batch:
- if lead dry is still missing in a specific preset/session, capture the visible `lead1Level`/`lead2Level`, send levels, and DAW routing state; current Product Core dry routing tests pass.

## Persistent Product-Control Reducer Commit Semantics - 2026-06-05

Changed files:
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/ProductRuntimeDiagnostics.ts`
- `src/audio/product/host/CoreProductHostDiagnostics.ts`
- `src/audio/product/host/CoreProductResolvedStateCommitService.ts`
- `src/audio/product/host/CoreProductSnapshotCoordinator.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/product-control/ProductControlActions.ts`
- `src/product-control/controlReducer.ts`
- `src/product-control/resolvePerformanceState.ts`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `src/ui/useAudioEngineParamSync.ts`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- `ProductResolvedStateCommit` now carries an optional apply mode, and `ResolvedPerformanceState` can request the same mode.
- `forceFullSnapshot` from the UI scheduler is now forwarded through the resolved-state commit path instead of being dropped.
- Preset-load/full-snapshot transactions can explicitly bypass dirty-diff in `CoreProductSnapshotCoordinator`.
- Resolved-state commit receipts now report the host's actual patch application mode: `dirty-diff`, `full-snapshot`, `event`, `deferred`, or `noop`.
- Deferred host patch application is not treated as applied, so trigger-critical `commitThenTrigger` ordering cannot pass on a deferred commit.
- `commitVisibleSliderStateForProduct()` now uses persistent per-engine `ProductControlState` reducer state aligned to the committed Product revision instead of creating a fresh control state for each live commit.
- Atomic visible-slider commits were added as a reducer action so compatibility commits advance one ProductControl revision per visible transaction.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:reference-isolation`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used reducer regression, host policy, dirty-diff, snapshot authority, running-sequencer live-update, and Product boundary/isolation gates.

Batch exit status:
- complete

State-authority invariant status:
- improved. Trigger-critical visible-state commits now flow through persistent ProductControl reducer state and carry explicit full-snapshot intent when required.
- not fully complete against the active ideal end state: sequencer patch bridges still need generated ProductEvent replacement, and drum morph override storage still needs migration out of module-level compatibility state.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- Policy scripts were updated to assert the new persistent reducer and actual commit-mode contract.
- Future bridge-removal work should preserve `ProductResolvedStateCommit.applyMode`, deferred receipt blocking, and persistent `productControlStateByEngine` revision alignment until a stronger app-level ProductControl store replaces it.

Next batch:
- replace the revisioned `applySequencerUiPatch` compatibility lane with generated ProductEvent batches where event coverage exists, starting with sub-lane enable/config and step value edits.

## Sequencer Synth Step Override Generated Events - 2026-06-05

Changed files:
- `src/audio/product/ProductSequencerStepOverrideEvents.ts`
- `src/audio/product/host/CoreProductSequencerStepEventBridge.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/host/CoreProductSequencerUiPatchBridge.ts`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/check-kessho-product-reference-isolation.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `docs/kessho-product-reference-isolation.md`
- `docs/product-core/common-control-routing.md`
- `docs/product-core/product-engine-port.md`
- `docs/product-core/unsupported-surface.md`
- `docs/product-core/architecture.md`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Synth step override edits now emit generated Product `SetSequencerStep` event batches instead of using `applySequencerUiPatch`.
- The Product host reconciles generated synth step toggle/config/value events into its sequencer cache before forwarding live runtime events.
- `ProductSequencerUiPatch` no longer exposes a `synth-step-overrides` compatibility patch kind.
- Drum step overrides remain on the revisioned compatibility bridge because they still need product-owned drum base MIDI conversion before they can be represented as pure generated Product events.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run migration:docs`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run core:product:resolved-state`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used host/runtime reconciliation, bridge policy, Product boundary/isolation, resolved-state, running-sequencer, and sequencer guardrails.

Batch exit status:
- complete

State-authority invariant status:
- improved. Synth sequencer step override edits now move through generated Product events and host cache reconciliation instead of a UI patch bridge.
- not final. Drum step overrides, remaining sub-lane/evolve/pitch/home-capture patch paths, and module-level drum morph override storage still need migration into Product-owned reducer state.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Future drum step override migration must preserve drum base MIDI conversion instead of assuming the synth normalized pitch-value path applies to drums.

Next batch:
- migrate the next `applySequencerUiPatch` path that can be losslessly represented by generated Product events; prefer drum step overrides only after explicit product-owned drum base MIDI state is available, otherwise start with sub-lane config/enable bridge replacement.

## Sequencer Pitch Setting Generated Events - 2026-06-05

Changed files:
- `src/audio/coreProductEvents.ts`
- `src/audio/product/host/CoreProductSequencerPitchSettingEventBridge.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/host/CoreProductSequencerUiPatchBridge.ts`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/check-kessho-product-reference-isolation.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `docs/kessho-product-reference-isolation.md`
- `docs/product-core/common-control-routing.md`
- `docs/product-core/product-engine-port.md`
- `docs/product-core/architecture.md`
- `docs/product-core/unsupported-surface.md`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Synth and drum pitch setting edits now emit generated Product `SetSequencerLane` event batches instead of using `applySequencerUiPatch`.
- Product pitch-scale events keep the existing runtime ABI value and add exact scale identity in `value2`, so the host can preserve UI scale names such as `Harmony` while the runtime still receives the generated Product scale ID.
- `CoreProductSequencerPitchSettingEventBridge` reconciles pitch setting events into host adapter state, forwards live runtime events, and posts synth note-range lane params when a synth lane uses `noteRange` pitch mode.
- Startup snapshot pitch-setting replay now posts generated pitch-setting events instead of calling host-only UI patch setters.
- `ProductSequencerUiPatch` no longer exposes `drum-pitch-settings` or `synth-pitch-settings` patch kinds.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:docs`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used host reconciliation, generated event policy, Product boundary/isolation, resolved-state, running-sequencer, and C++ sequencer gates.

Batch exit status:
- complete

State-authority invariant status:
- improved. Pitch settings now move through generated Product events and a single host reconciliation bridge instead of a revisioned UI patch branch.
- not final. Remaining `applySequencerUiPatch` paths are evolve configs, sub-lane enabled/config, drum step overrides, preset home snapshots, and lane home capture; drum morph override storage is still module-level compatibility state.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Future sub-lane work must preserve enabled-state filtering for runtime step value posting; future drum step override work must preserve drum base MIDI conversion.

Next batch:
- migrate sub-lane enabled/config state toward generated Product events or ProductControl-owned state, then revisit drum step overrides once drum base MIDI is Product-owned.

## Sequencer Sub-Lane Enabled Generated Events - 2026-06-05

Changed files:
- `src/audio/coreProductEvents.ts`
- `src/audio/product/ProductSequencerSubLaneEnabledEvents.ts`
- `src/audio/product/host/CoreProductSequencerSubLaneEnabledEventBridge.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/host/CoreProductSequencerUiPatchBridge.ts`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/check-kessho-product-reference-isolation.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `docs/kessho-product-reference-isolation.md`
- `docs/product-core/common-control-routing.md`
- `docs/product-core/product-engine-port.md`
- `docs/product-core/architecture.md`
- `docs/product-core/unsupported-surface.md`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Synth and drum sub-lane enabled edits now emit generated Product `SetSequencerStep` sub-lane config events instead of using `applySequencerUiPatch`.
- A host-only `subLaneEnabledState` event flag lets `CoreProductSequencerSubLaneEnabledEventBridge` update host enabled-state arrays without treating an enabled toggle as a standalone runtime sub-lane config.
- After each enabled-state event, the host clears morph feedback and replays filtered cached step state through the existing generated step-event posting path.
- `ProductSequencerUiPatch` no longer exposes `drum-sub-lane-enabled` or `synth-sub-lane-enabled` patch kinds.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:docs`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used host reconciliation, generated event policy, Product boundary/isolation, resolved-state, running-sequencer, and C++ sequencer gates.

Batch exit status:
- complete

State-authority invariant status:
- improved. Sub-lane enabled state now enters the Product host through generated Product events and one reconciliation bridge, then replays the same filtered runtime step state represented by the visible sequencer controls.
- not final. Remaining `applySequencerUiPatch` paths are evolve configs, drum step overrides, preset home snapshots, and lane home capture; drum morph override storage is still module-level compatibility state.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- The enabled-state event marker is outside the C++ step-field bit mask and is consumed by the host before normal step-event cache reconciliation.
- Future drum step override work must preserve drum base MIDI conversion.

Next batch:
- migrate the drum step override patch path by introducing Product-owned drum base MIDI context, or migrate sequencer home capture if drum base MIDI ownership is not ready.

## Drum Step Override Generated Events - 2026-06-05

Changed files:
- `src/audio/coreProductEvents.ts`
- `src/audio/CoreProductHostSequencerAdapter.ts`
- `src/audio/product/ProductSequencerStepOverrideEvents.ts`
- `src/audio/product/host/CoreProductSequencerStepOverrideEventBridge.ts`
- `src/audio/product/host/CoreProductSequencerStepOverrideBridge.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/host/CoreProductSequencerUiPatchBridge.ts`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-kessho-product-reference-isolation.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `docs/kessho-product-reference-isolation.md`
- `docs/product-core/common-control-routing.md`
- `docs/product-core/product-engine-port.md`
- `docs/product-core/kessho_product_core_batched_plan_and_agent_prompt.md`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Drum step override edits in core-product mode now emit generated `SetSequencerStep` Product event batches instead of `productEngine.applySequencerUiPatch({ kind: 'drum-step-overrides' })`.
- Drum pitch values remain UI offsets in the event batch, marked with `drumPitchOffsetValue`, then `CoreProductSequencerStepOverrideEventBridge` resolves them against Product drum base MIDI before the host cache and runtime sync see them.
- A `stepOverrideState` marker lets the host consume the drum override batch into its sequencer cache without direct partial runtime posting; a final `stepOverrideCommit` marker runs the existing full filtered sync plus manual-dice/home-capture side effects.
- `ProductSequencerUiPatch` and `CoreProductSequencerUiPatchBridge` no longer expose or handle `drum-step-overrides`.
- The old drum object-override helper was removed from `CoreProductSequencerStepOverrideBridge`; that compatibility helper is now synth-only.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:docs`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used host reconciliation, generated event policy, Product boundary/isolation, resolved-state, running-sequencer, and C++ sequencer gates.

Batch exit status:
- complete

State-authority invariant status:
- improved. Drum step overrides now enter the Product host as generated Product events, and each runtime sync plays from the host-resolved cache state that matches the visible drum sequencer controls after pitch-offset/base-MIDI resolution.
- not final. Remaining `applySequencerUiPatch` paths are evolve configs, preset home snapshots, and lane home capture; drum morph override storage is still module-level compatibility state.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- The drum override event markers are host-consumed high bits outside the generated step-field mask; the runtime receives normal generated step events only after the final filtered sync.

Next batch:
- migrate sequencer preset home snapshots and lane home capture toward Product events or ProductControl-owned state, then migrate evolve configs.

## Sequencer Home Capture Generated Events - 2026-06-05

Changed files:
- `src/audio/coreProductEvents.ts`
- `src/audio/product/ProductSequencerHomeCaptureEvents.ts`
- `src/audio/product/host/CoreProductSequencerHomeCaptureEventBridge.ts`
- `src/audio/product/host/CoreProductSequencerHomeCaptureBridge.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/host/CoreProductSequencerUiPatchBridge.ts`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-kessho-product-reference-isolation.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `docs/kessho-product-reference-isolation.md`
- `docs/product-core/common-control-routing.md`
- `docs/product-core/product-engine-port.md`
- `docs/product-core/architecture.md`
- `docs/product-core/unsupported-surface.md`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Sequencer preset-home snapshots now emit generated Product home-capture event batches instead of `applySequencerUiPatch({ kind: 'preset-home-snapshots' })`.
- Synth and drum lane-home capture now emit generated Product home-capture marker events instead of `capture-*-lane-home` UI patch kinds.
- `CoreProductSequencerHomeCaptureEventBridge` decodes force, require-content, pitch steps, pitch direction, and explicit `scaleQuantize` true/false metadata before calling the existing home-cache capture path.
- Drum home capture now falls back to `adapterState.drumPitchSettings`, which is updated by generated pitch-setting events, so reset-home payloads keep drum pitch setting metadata without object patch payloads.
- `ProductSequencerUiPatch` and `CoreProductSequencerUiPatchBridge` are now narrowed to drum/synth evolve config patches only.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:docs`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used host reconciliation, generated event policy, Product boundary/isolation, resolved-state, running-sequencer, and C++ sequencer gates.

Batch exit status:
- complete

State-authority invariant status:
- improved. Preset-home and lane-home capture now enter through generated Product events and capture the same resolved sequencer cache state represented by visible controls, with pitch metadata preserved through the host bridge.
- not final. Remaining `applySequencerUiPatch` paths are drum/synth evolve configs; drum morph override storage is still module-level compatibility state.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Home-capture markers are host-consumed high bits outside the generated step-field mask; they do not post raw marker events to the runtime.

Next batch:
- migrate drum/synth evolve config patches to generated Product events or ProductControl-owned reducer state, then reassess the remaining module-level drum morph override storage.

## Sequencer Evolve Config Generated Events - 2026-06-05

Changed files:
- `src/audio/coreProductEvents.ts`
- `src/audio/CoreProductHostSequencerEvolveConfig.ts`
- `src/audio/product/ProductSequencerEvolveConfigEvents.ts`
- `src/audio/product/host/CoreProductSequencerEvolveConfigEventBridge.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/ProductEnginePort.ts`
- `src/audio/product/WebProductEngine.ts`
- `src/audio/product/host/CoreProductRuntimeHostPort.ts`
- `src/audio/product/host/CoreProductSequencerUiPatchBridge.ts`
- `src/audio/product/ProductRuntimeDiagnostics.ts`
- `src/audio/product/host/CoreProductHostDiagnostics.ts`
- `src/audio/product/host/CoreProductResolvedStateCommitService.ts`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-kessho-product-reference-isolation.mjs`
- `scripts/check-product-docs-freshness.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `docs/kessho-product-reference-isolation.md`
- `docs/product-core/common-control-routing.md`
- `docs/product-core/product-engine-port.md`
- `docs/product-core/architecture.md`
- `docs/product-core/unsupported-surface.md`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Drum and synth sequencer evolve config edits now emit generated Product `SetSequencerLane` event batches instead of `applySequencerUiPatch`.
- `CoreProductSequencerEvolveConfigEventBridge` consumes the host-only `CORE_PRODUCT_HOST_PARAM_IDS.SequencerEvolveConfig` marker, rebuilds the Product host synth/drum evolve config cache, and preserves method flags, mutation mode, write offset, and enabled sub-lane filters.
- Evolve-config marker events are host-only and are not posted to the runtime; normal sequencer timing/evolve reads the updated host adapter state.
- `applySequencerUiPatch` was removed from `ProductEnginePort`, `WebProductEngine`, and `CoreProductRuntimeHostPort`; `ProductSequencerUiPatch` was removed and `CoreProductSequencerUiPatchBridge.ts` was deleted.
- Obsolete sequencer UI patch revision diagnostics were removed now that no production patch bridge remains.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:docs`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used host reconciliation, generated event policy, Product boundary/isolation, resolved-state, running-sequencer, runtime fallback, getter policy, no-web-ts, and C++ sequencer gates.

Batch exit status:
- complete

State-authority invariant status:
- improved. All prior `applySequencerUiPatch` production paths are now replaced by generated Product event batches, so sequencer evolve config, home capture, pitch settings, sub-lane enabled state, and synth/drum step overrides resolve through the same visible Product host state before triggers/evolve ticks read them.
- not final. Drum morph override storage still has module-level authority outside persistent `ProductControlState`; final signoff still needs that hidden authority migrated or eliminated.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- The host-only evolve config param ID is negative and consumed before runtime posting, so it cannot become a native runtime fallback or generated ABI collision.

Next batch:
- migrate drum morph override storage into ProductControl-owned persistent state or eliminate it behind resolved commits, then run final state-authority signoff.

## Drum Morph ProductControl Override State - 2026-06-05

Changed files:
- `src/product-control/drumMorphOverrideState.ts`
- `src/product-control/ProductControlState.ts`
- `src/product-control/ProductControlActions.ts`
- `src/product-control/controlReducer.ts`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/index.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `src/audio/drumMorph.ts`
- `src/App.tsx`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Drum morph value overrides and dual-range endpoint overrides now live in persistent `ProductControlState.drumMorphOverrides` and are changed through `reduceProductControlState()` actions.
- `src/audio/drumMorph.ts` no longer owns module-level override maps or an authority revision; it remains a pure preset interpolation helper that accepts explicit ProductControl override state.
- App drum synth parameter edits, drum morph preset endpoint clears, midpoint clears, dual-mode toggles, and dual-range edits now dispatch ProductControl drum morph actions and recompute the visible slider state from the same override snapshot.
- Drum morph mutations that affect sound still immediately commit the resulting visible slider state with `reason: 'morph-control-change'` and `triggerCritical: true`.
- The running-sequencer live-update gate now fails if the old drum morph module authority bridge returns.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:docs`: pass
- `rg -n "applySequencerUiPatch|ProductSequencerUiPatch|CoreProductSequencerUiPatchBridge|recordSequencerUiPatch|sequencerUiPatch" src --glob '!src/audio/reference/webTs/**'`: pass, no output
- `rg -n "drumMorphAuthorityRevision|getDrumMorphAuthorityRevision|setDrumMorphOverride|clearDrumMorphEndpointOverrides|clearMidMorphOverrides|setDrumMorphDualRangeOverride|getDrumMorphDualRangeOverrides|interpolateDrumMorphDualRanges|const drumMorphOverrides|const drumMorphDualRangeOverrides" src --glob '!src/audio/reference/webTs/**'`: pass, no output
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used TypeScript, ProductControl resolved-state regression, Product boundary/web-host, live-update guard, docs freshness, and static hidden-authority searches.

Batch exit status:
- complete

State-authority invariant status:
- improved. Drum morph override mutations no longer have a separate `drumMorph.ts` module authority; the UI-visible recomputation and the Product commit now read the same ProductControl-owned drum morph override state.
- not final until the full state-authority signoff suite passes after this batch.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- The migration is scoped to the state-authority repair; broad host/App cleanup and CPU tuning were not performed.

Next batch:
- run final state-authority signoff across the full Product Core gate suite and close any regressions found there.

## Final State-Authority Signoff - 2026-06-05

Changed files:
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- No additional runtime behavior change in this signoff batch.
- The current Product Core state-authority repair now has all former sequencer UI patch bridge paths retired, drum morph override authority moved into persistent ProductControl reducer state, and trigger-critical visible state commits passing the revisioned commit barrier.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:patch-bridges`: pass
- `npm run core:product:reference-isolation`: pass
- `npm run migration:docs`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:snapshot-authority`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:getter-policies`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `rg -n "drumMorphAuthorityRevision|getDrumMorphAuthorityRevision|setDrumMorphOverride|clearDrumMorphEndpointOverrides|clearMidMorphOverrides|setDrumMorphDualRangeOverride|getDrumMorphDualRangeOverrides|interpolateDrumMorphDualRanges|const drumMorphOverrides|const drumMorphDualRangeOverrides" src --glob '!src/audio/reference/webTs/**'`: pass, no output
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; final signoff used the full Product Core state-authority gate suite, including TypeScript, Product host/web-host gates, patch bridge policy, reference isolation, docs freshness, dirty-diff/snapshot authority, ProductControl resolved-state regression, C++ sequencer regression, runtime fallback/getter policies, no-web-ts bundle guard, and static hidden-authority searches.

Batch exit status:
- complete

State-authority invariant status:
- complete for the current Product Core repair scope. Trigger-critical Product paths now commit one resolved visible parameter state through the revisioned ProductControl/Product commit barrier before sound triggers; preset, morph, endpoint, drum morph override, sub-sequencer, sequencer step override, pitch setting, home capture, and evolve config paths are covered by the passing signoff gates.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining and CPU/granular/reverb optimization were intentionally not included in this state-authority signoff.

Next batch:
- state-authority repair is signed off; the next work can move to separately scoped cleanup or CPU optimization after reviewing the remaining dirty tree.

## ProductControl Patch Authority Correction - 2026-06-06

Changed files:
- `src/product-control/ProductControlActions.ts`
- `src/product-control/controlReducer.ts`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `src/ui/useAudioEngineParamSync.ts`
- `src/ui/useSelectedAudioEngineManualTriggers.ts`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Live Product Core UI updates now commit through `commitProductControlPatchForProduct()`, which reduces the changed patch as ProductControl actions before resolving and committing.
- `ProductControlState` now supports a `slider/patch` action, so multi-key visible changes can be merged into persistent reducer state without replacing the whole raw slider authority.
- The legacy `commitVisibleSliderStateForProduct()` compatibility helper now computes the changed patch from the persistent reducer state and routes through the same patch reducer path instead of directly replacing `rawSliders`.
- Manual Product Core synth/drum triggers now use `commitProductControlActionThenTrigger()`, syncing current visible sliders into persistent ProductControl state before firing the trigger and without passing external state to Product runtime triggers.
- Source-core live edits for pad, lead, and drum source patch keys are forced into resolved full-snapshot commits so running sequencer triggers rebuild source patch state instead of hearing stale startup patches.
- Morph-control inferred commits now remain trigger-critical even when the caller did not explicitly pass `triggerCritical: true`.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:web-host`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used reducer regression, running-sequencer static/live-update gate, dirty-diff behavior harness, host reconciliation, web-host, and no-web-ts diff checks.

Batch exit status:
- complete

State-authority invariant status:
- improved but not final. Live UI updates and manual triggers now enter persistent ProductControl reducer state instead of constructing a fresh reducer state or replacing the whole visible state as authority.
- the earlier “Final State-Authority Signoff” entry is superseded for the broader ProductControlState goal; ProductControlState still needs to own remaining host adapter/cache authorities, source endpoint preset data hydration, and generated sequencer event state before the full objective can be marked complete.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining and CPU/granular/reverb tuning were not included.

Next batch:
- move remaining sequencer/generated event state and source endpoint/preset-data hydration authorities into ProductControl actions or explicitly resolved ProductControl-owned state, then rerun full state-authority signoff.

## Sequencer ProductControl Event Commit Routing - 2026-06-06

Changed files:
- `src/App.tsx`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `src/ui/useProductRuntimeControlSurfaces.ts`
- `src/ui/useProductRuntimeSequencerControls.ts`
- `src/ui/useProductRuntimeSurfaces.ts`
- `src/ui/useSelectedAudioEngineSequencerControls.ts`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Product Core sequencer UI controls no longer call `productEngine.enqueueEvent()` or `productEngine.enqueueEvents()` directly from UI hooks.
- Generated sequencer ProductEvent batches now enter through `commitProductControlActionForProduct()` as `sequencer/edit` ProductControl actions with `productEvents` attached to the same resolved commit.
- Product runtime sequencer control surfaces now receive `stateRef`, so generated sequencer events are committed against the current visible slider state.
- ProductControl state stores the sequencer intent patch for evolve configs, clock divisions, swings, sub-lane enable state, pitch settings, pitch binding modes, step overrides, preset home capture, lane home reset/capture, and dice actions.
- The resolved-state regression now proves event-bearing ProductControl actions allocate one revision, include generated Product events atomically, and resolve from the visible slider state.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:web-host`: pass
- `npm run migration:docs`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `rg -n "productEngine\\.enqueueEvent\\(|productEngine\\.enqueueEvents\\(" src/ui src/App.tsx --glob '!src/audio/reference/webTs/**'`: pass, no output
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used TypeScript, ProductControl resolved-state regression, running-sequencer live-update guard, Product boundary, web-host, docs freshness, host reconciliation, dirty-diff, C++ sequencer, runtime fallback, no-web-ts bundle, and static direct-enqueue search.

Batch exit status:
- complete

State-authority invariant status:
- improved but not final. Sequencer generated-event operations now enter ProductControl actions and commit atomically with the visible resolved state instead of bypassing ProductControl through direct UI event enqueue.
- remaining work: source endpoint preset-data hydration and any host adapter/cache authorities that still mutate outside ProductControl must be migrated or explicitly represented in ProductControl-owned resolved state before the full objective is complete.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host cleanup and CPU/granular/reverb retuning were not included.

Next batch:
- migrate source endpoint preset data hydration and remaining host adapter/cache authority into ProductControl-owned actions/state, then run full state-authority signoff.

## Lead Preset Data ProductControl Authority - 2026-06-06

Changed files:
- `src/audio/coreProductEngineHost.ts`
- `src/audio/product/host/CoreProductLeadPresetDataLoader.ts`
- `src/product-control/ProductControlActions.ts`
- `src/product-control/ProductControlState.ts`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/controlReducer.ts`
- `src/product-control/leadPresetData.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-web-host.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- `ProductControlState.rawSliders` can now persist hidden Product source data alongside visible sliders, so non-visible Lead preset data can be part of the same reducer-owned state as the visible preset selectors.
- ProductControl commit helpers now hydrate missing or stale Lead preset data before reducing and resolving Product commits. A Lead preset id change and its `lead*Preset*Data` payload now share one ProductControl commit revision and one resolved Product patch.
- Running/manual/ProductControl action commits hydrate Lead preset data as a visible-state sync step before sequencer events or trigger requests are resolved, so generated events and triggers read the same source state represented by visible controls.
- `CoreProductLeadPresetDataLoader.syncPresetData()` no longer schedules async host-owned preset loads or patches adapter state. It only mirrors preset data already present in the resolved ProductControl patch into the host adapter snapshot input.
- `CoreProductLeadPresetDataLoader.loadLeadPreset()` is now cache warm-up only. The host `patchAdapterState()` hidden mutator was removed.
- Web-host and host-reconciliation checks now reject reintroducing host adapter patch authority for Lead preset data.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run migration:docs`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `rg -n "productEngine\\.enqueueEvent\\(|productEngine\\.enqueueEvents\\(|applySequencerUiPatch" src/ui src/App.tsx src/product-control src/audio/product src/audio/coreProductEngineHost.ts --glob '!src/audio/reference/webTs/**'`: pass, no output
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; this batch used TypeScript, ProductControl resolved-state regression, web-host, host reconciliation, Product boundary, running-sequencer live-update guard, dirty-diff, C++ sequencer, runtime fallback, docs freshness, no-web-ts bundle, static direct-enqueue/retired-bridge search, and no-web-ts diff checks.

Batch exit status:
- complete

State-authority invariant status:
- improved. Lead preset selector changes now resolve the preset data used by Product source patch generation before the commit barrier applies the runtime snapshot, eliminating the async host adapter data patch that could leave running sequencer triggers on stale Lead sounds.
- not final for the full ProductControlState objective. Remaining host adapter/cache state used by sequencer runtime behavior still needs a final audit and either ProductControl ownership or an explicit runtime-owned exception before the goal can be marked complete.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining and CPU/granular/reverb retuning were not included.

Next batch:
- audit the remaining host adapter/cache state used after ProductControl commits, especially sequencer cache/home/evolve runtime state, and either migrate it into ProductControl-owned resolved state or document it as derived runtime cache with no independent parameter authority.

## Final ProductControlState Authority Signoff - 2026-06-06

Changed files:
- `docs/product-core/common-control-routing.md`
- `docs/product-core/product-engine-port.md`
- `docs/product-core/unsupported-surface.md`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Documentation now reflects the final ProductControlState authority contract: sequencer controls enter as ProductControl `sequencer/edit` actions with generated ProductEvents attached to the same resolved commit.
- Remaining host sequencer cache/home/evolve state is documented as runtime-derived cache fed by ProductControl-committed events, not as an independent UI parameter authority.
- Retired compatibility paths remain forbidden: no `applySequencerUiPatch`, no direct UI `productEngine.enqueueEvent(s)`, no host `patchAdapterState`, and no host Lead preset async patch lane.

Validation run:
- `npm run type-check`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run migration:docs`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `rg -n "productEngine\\.enqueueEvent\\(|productEngine\\.enqueueEvents\\(|applySequencerUiPatch|patchAdapterState\\(|pendingLoads" src/ui src/App.tsx src/product-control src/audio/product src/audio/coreProductEngineHost.ts --glob '!src/audio/reference/webTs/**'`: pass, no output
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- not run; final proof used TypeScript, ProductControl reducer regression, running-sequencer live-update gate, Product boundary, web-host, host reconciliation, dirty-diff behavior harness, compiled C++ sequencer tests, runtime fallback gate, docs freshness, no-web-ts bundle gate, static retired-bridge search, and no-web-ts diff checks.

Batch exit status:
- complete

State-authority invariant status:
- complete for the ProductControlState objective. Preset, morph, endpoint, drum morph, sub-sequencer/sequencer, override, Lead preset data, live parameter, generated sequencer event, and manual trigger paths now enter persistent ProductControl reducer state or ProductControl-committed generated ProductEvents before runtime triggers/evolve reads can observe them.
- Host sequencer cache/home/evolve state remains as runtime-derived cache only. It is fed by committed ProductControl actions/events and guarded against direct UI writes or full-snapshot shortcuts.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining and CPU/granular/reverb retuning were not included in the state-authority work.

Next batch:
- ProductControlState state-authority repair is signed off. Next work can move to CPU optimization/tech-debt cleanup or a manual browser/audio verification pass against the specific running-sequencer preset-change and Lead dry-output scenarios.

## Running Sequencer Regression Repair - 2026-06-06

Changed files:
- `src/audio/coreProductEngineHost.ts`
- `src/audio/product/host/CoreProductResolvedStateCommitService.ts`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `src/ui/useAudioEngineParamSync.ts`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Sequencer master transport keys now route through immediate resolved ProductControl commits instead of the legacy snapshot patch path.
- Trigger-critical sequencer transport start commits now advance the Product committed revision even when the host runtime start work is deferred; the runtime still loads the snapshot before the start event is posted.
- ProductControl sequencer action commits now sync current visible sliders as raw slider state before applying the sequencer edit. Running sequencer edits can no longer hide live sound-parameter changes inside `sequencer.patch`, which prevented later triggers from using the visible slider values.
- Forced full-snapshot commit options are now forwarded from the host commit service into the host snapshot apply path.
- The running-sequencer gate now includes a host harness proof that master enable commits the revision, loads a snapshot, and posts a runtime start event.

Validation run:
- `npm run core:product:resolved-state`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run type-check`: pass
- `npm run core:product:web-host`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run migration:product-boundary`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run migration:no-web-ts-bundle`: pass
- `npm run migration:docs`: pass
- `npm run core:product:browser-runtime`: pass
- `node scripts/check-kessho-product-web-graph-capture-smoke.mjs --case=sequenced-synth-euclid-lead1-dry-routing --case=sequenced-drum-euclid-kick-dry-routing`: pass
- `rg -n "productEngine\\.enqueueEvent\\(|productEngine\\.enqueueEvents\\(|applySequencerUiPatch|patchAdapterState\\(" src/ui src/App.tsx src/product-control src/audio/product src/audio/coreProductEngineHost.ts --glob '!src/audio/reference/webTs/**'`: pass, no output
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- Browser runtime smoke passed.
- Focused web graph audio smoke passed for `sequenced-synth-euclid-lead1-dry-routing` and `sequenced-drum-euclid-kick-dry-routing`; both Web and Core routes produced dry signal above the smoke gate.

Batch exit status:
- complete

State-authority invariant status:
- restored for the reported running-sequencer regression. A sequencer start now commits the same ProductControl-resolved state represented by the visible master/lane/source sliders before runtime start, and subsequent sequencer edits sync current visible sound parameters before generated ProductEvents are attached.
- Remaining risk is manual in-app interaction coverage: the automated browser/audio smokes prove start and dry route signal, but they do not click through every UI preset-change/morph sequence a user can perform.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining and CPU/granular/reverb retuning were not included.

Next batch:
- Open the app and manually verify the exact UI flow: start synth sequencer, enable sub-sequencer morph, change pad/lead presets and sound sliders while running, and confirm the next triggers reflect the visible controls.

## Preset Morph Sequencer Continuity Repair - 2026-06-08

Changed files:
- `src/audio/CoreProductRuntimeAdapter.ts`
- `src/audio/product/host/CoreProductPatchClassifier.ts`
- `src/ui/useAudioEngineParamSync.ts`
- `src/ui/usePresetEngineSync.ts`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- `scripts/check-kessho-product-host-reconciliation.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-product-engine-boundary.mjs`
- `scripts/lib/kesshoProductBehaviorHarness.mjs`
- `scripts/lib/kesshoProductWebGraphSmokeCases.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Product preset loads remain trigger-critical resolved ProductControl commits, but no longer force full snapshots by default. This preserves sequencer continuity while keeping preset state authoritative.
- `preset-load` now falls back as a normal `product-patch` instead of `explicit-reset-request`.
- Source preset endpoint changes that can be represented as generated ProductEvents now dirty-diff through `SetSourcePreset` endpoint events instead of forcing a full snapshot reload.
- Source-core parameter edits still route through resolved ProductControl commits, but source-core resolution is separate from forced full-snapshot behavior.
- Added regression coverage for the reported cross-source static case: changing `lead1Morph` while a Pad sequencer lane is active must dirty-diff as a Lead-targeted `SourceMorph` event and emit no Pad-targeted source event.
- Updated VM harness stubs for async snapshot loading and product-state debug helpers so host/dirty-diff verifiers exercise the current async host path.
- Added a browser graph smoke case for `lead1-morph-while-sequenced-pad1-route-smoke`.

Validation run:
- `npm run core:product:resolved-state`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run type-check`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:runtime-fallbacks`: pass
- `npm run core:product:browser-runtime`: pass
- `node scripts/check-kessho-product-web-graph-capture-smoke.mjs --case=lead1-morph-while-sequenced-pad1-route-smoke`: pass
- `rg -n "productEngine\\.enqueueEvent\\(|productEngine\\.enqueueEvents\\(|applySequencerUiPatch|patchAdapterState\\(" src/ui src/App.tsx src/product-control src/audio/product src/audio/coreProductEngineHost.ts --glob '!src/audio/reference/webTs/**'`: pass, no output
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Validation not clean:
- `npm run core:product:web-host`: still fails on `src/audio/coreProductEngineHost.ts` line-count cap. Not chased because broad host cleanup is outside this state-authority continuity repair.
- `npm run migration:product-boundary`: preset-sync `forceFullSnapshot` failure was removed, but unrelated preset/cloud ownership checks still fail.
- `npm run migration:no-web-ts-bundle`: fails on existing `dist/` bundle artifacts containing reference/web-ts markers; source diff still shows no `src/audio/reference/webTs/**` changes.

Manual/audio tests:
- Browser runtime smoke passed.
- Focused graph smoke passed for Lead morph changes while sequencing Pad dry route. This verifies Pad route signal stays present while Lead morph events are applied; static/noise still needs a human listening pass in the app.

Batch exit status:
- complete for the preset-load/preset-morph sequencer continuity repair.

State-authority invariant status:
- restored for preset-load and preset-morph continuity. The visible preset/morph state still commits through ProductControl before runtime observation, but the runtime now applies event-representable source changes without resetting sequencer clock/snapshot state.
- The cross-source Lead morph while Pad sequencing path is covered at dirty-diff event scope and browser route-smoke scope.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host line-count cleanup, CPU optimization, granular retuning, and reverb retuning were not included.

Next batch:
- Manual in-app audio verification: start Pad sequencer, move Lead preset morph repeatedly, change Pad/Lead preset endpoints, and listen for any Pad static or sequencer phase reset. If static remains, capture the exact source/lane/preset combination and inspect worklet-level source-preset patch application.

## Preset Morph Playhead Reset Repair - 2026-06-08

Changed files:
- `src/audio/CoreProductHostSequencerClock.ts`
- `src/audio/coreProductEngineHost.ts`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- The sequencer clock rejoin guard now resolves lane-enabled state with the same default as the Product snapshot builder. A full resolved patch that only makes the default synth lane 1 explicit no longer looks like a new lane enable, so preset morph/state commits do not request a clock rejoin for that case.
- Step-position callback registration no longer emits synthetic `[0, 0, 0, 0]` playhead/hit-count payloads while the Product host is running. If current telemetry exists, the host republishes current sequencer visuals; if telemetry is not available yet, registration stays silent instead of resetting the visible playhead.
- Added running-sequencer regression coverage for preset-morph full-patch continuity, real lane-enable/timing rejoin preservation, and callback registration playhead continuity.

Validation run:
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run type-check`: pass
- `npm run core:product:sequencer`: pass
- `node scripts/check-kessho-product-web-graph-capture-smoke.mjs --case=lead1-morph-while-sequenced-pad1-route-smoke`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Validation not clean:
- `npm run core:product:web-host`: still fails on `src/audio/coreProductEngineHost.ts` line-count cap (`1067` lines). Not chased because broad host cleanup is outside this state-authority regression repair.

Manual/audio tests:
- Focused browser graph smoke passed for the existing Lead-morph-while-Pad-sequenced route case. This confirms Pad dry signal remains present during the cross-source morph path.
- No human listening pass was performed in the app during this batch.

Batch exit status:
- complete for the preset morph playhead reset regression repair.

State-authority invariant status:
- restored for the reported preset-morph sequencer reset path at host/clock authority level. Preset morph commits can update the resolved visible state without rejoining the sequencer clock or forcing callback registration to publish a beginning-of-sequence playhead.
- Remaining risk is manual in-app verification of the exact gesture sequence across all active synth lanes and sub-sequencer morph configurations.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining, CPU optimization, granular retuning, and reverb retuning were not included.

Next batch:
- Run the app and manually reproduce: start Pad sequencer, enable sub-sequencer morph, drag Pad preset morph repeatedly, change Pad preset endpoints, and confirm the audio and playhead stay continuous. If any reset remains, capture whether the audio phase resets, the UI playhead resets, or both.

## Preset Endpoint Override Continuity Repair - 2026-06-08

Changed files:
- `src/audio/CoreProductRuntimeAdapter.ts`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Source sparse override diffs for Pad, Lead, and Drum are now accepted as dirty-diffable when the generated source override event path can represent them.
- Preset endpoint A/B changes that also change sparse source overrides no longer force a full snapshot reload. The runtime adapter now emits generated source preset endpoint events plus source override slot/commit events.
- Added a sequence regression for the reported failure mode: endpoint+override dirty diff first, then a later preset morph change must remain a `SourceMorph` dirty diff and must not become reset-prone.

Validation run:
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run type-check`: pass
- `npm run core:product:sequencer`: pass
- `node scripts/check-kessho-product-web-graph-capture-smoke.mjs --case=lead1-morph-while-sequenced-pad1-route-smoke`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Validation not clean:
- `npm run core:product:web-host`: still fails on `src/audio/coreProductEngineHost.ts` line-count cap (`1067` lines). Not chased because broad host cleanup is outside this state-authority regression repair.

Manual/audio tests:
- Focused browser graph smoke passed for the Lead-morph-while-Pad-sequenced route case.
- No human listening pass was performed in the app during this batch.

Batch exit status:
- complete for the preset endpoint A/B plus later morph reset regression repair.

State-authority invariant status:
- restored for endpoint preset swaps that generate sparse source override changes. A running trigger can now observe the same resolved endpoint/morph state as the visible controls without the host falling back to a full snapshot reload.
- The exact reported sequence is covered at dirty-diff scope: endpoint+override commit, then subsequent morph commit.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining, CPU optimization, granular retuning, and reverb retuning were not included.

Next batch:
- Manual in-app verification of the exact UI gesture: start the Pad sequencer with morph sub-sequencer off, change Pad preset A or B, then drag Pad preset morph repeatedly. Confirm both audio and playhead remain continuous.

## ProductControl Commit Barrier Hot-Swap Repair - 2026-06-09

Changed files:
- `src/product-control/commitResolvedState.ts`
- `src/product-control/resolvePerformanceState.test.ts`
- `cpp/KesshoCore/tests/ProductSequencerTests.cpp`
- `scripts/check-kessho-product-running-preset-hot-swap-debug.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- ProductControl commits are now serialized per Product engine. A later morph/state-sync commit can no longer read stale reducer state while an earlier preset endpoint commit is still awaiting its audio-thread receipt.
- This prevents a running-sequencer preset endpoint hot-swap from being silently overwritten by a follow-up resolved Product patch based on the old endpoint state.
- Added a ProductControl race regression: a Pad endpoint commit held open by a delayed receipt must complete before the next morph commit, and the morph commit must retain the new endpoint.
- Added a native Product sequencer render regression: with transport running and a Pad lane producing triggers, a queued Pad endpoint A preset event must keep the sequencer triggering and the next Pad trigger must carry a changed source/compiled patch hash.
- Updated the browser hot-swap debug script to verify running transport, dirty-diff application, changed Pad source hash, and trigger-visible source hash without requiring unreliable continuous spawn telemetry from headless Chromium.

Validation run:
- `npm run core:product:resolved-state`: pass
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:hot-swap-debug`: pass
- `npm run core:product:state-authority`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run type-check`: pass
- `npm run migration:docs`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Validation not clean:
- `npm run core:product:web-host`: still known to fail on the `src/audio/coreProductEngineHost.ts` line-count cap. Not chased because broad host cleanup remains outside this state-authority repair.

Manual/audio tests:
- No human listening pass was performed in the app during this batch.
- Automated native render coverage now proves the running Pad sequencer keeps triggering and consumes the changed endpoint patch after a hot-swap.
- Browser hot-swap debug proves the TS/ProductControl/browser path applies the Pad preset hot-swap as a dirty diff while transport remains running.

Batch exit status:
- complete for the ProductControl async commit race that could revert running preset endpoint changes.

State-authority invariant status:
- restored for the reported "preset changes while sequencer is running do not change sound" failure at reducer/commit-barrier level. Every queued commit now resolves from the latest committed ProductControl state before the next trigger-critical patch is sent.
- Native Product Core render coverage verifies the downstream trigger path can consume the changed endpoint state without stopping the sequencer.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host streamlining, CPU optimization, granular retuning, and reverb retuning were not included.
- Existing unrelated dirty files from earlier batches were left in place.

Next batch:
- Manual in-app verification of the exact gesture: start Pad sequencer, change Pad preset A or B, then move Pad preset morph. Confirm the playhead stays continuous and the next triggered notes use the changed preset sound.

## Source Preset Full Snapshot Hot-Swap Repair - 2026-06-09

Changed files:
- `src/ui/usePresetEngineSync.ts`
- `src/ui/useAudioEngineParamSync.ts`
- `src/audio/CoreProductRuntimeAdapter.ts`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `scripts/check-kessho-product-running-preset-hot-swap-debug.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Product preset loads now force trigger-critical Product full snapshots instead of relying on a changed-key patch.
- Pad/Lead preset endpoint changes, Drum voice preset endpoint ID changes, and Lead preset-data changes now resolve through ProductControl with `applyMode: full-snapshot`.
- The runtime adapter now refuses Pad/Lead/Drum source preset endpoint and sparse override/body changes as live dirty diffs. If a caller forgets to request a full snapshot, the adapter falls back to a full snapshot instead of applying a partial hidden source authority.
- Preset morph, Drum voice morph-only changes, and cheap source runtime controls remain on the continuous dirty-diff/resolved path.
- Browser hot-swap proof now verifies the intended path: ProductControl full-snapshot commits, encoded snapshot changes, worklet-applied snapshot hashes, running transport, and next trigger source/compiled hashes matching the changed Pad/Lead source state.

Validation run:
- `npm run core:product:dirty-diff`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run core:product:sequencer`: pass
- `npm run core:product:hot-swap-debug`: pass
- `npm run core:product:state-authority`: pass
- `npm run core:product:host-reconciliation`: pass
- `npm run type-check`: pass
- `npm run migration:docs`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Validation not run:
- `npm run core:product:web-host`: not run in this batch. The known `src/audio/coreProductEngineHost.ts` line-count cap remains outside this state-authority repair and was not chased.

Manual/audio tests:
- No human listening pass was performed in the app during this batch.
- Automated browser hot-swap proof passed. The report shows Pad source hash `8ca828e4/f60d0e67 -> 18ea1aee/f92555a2`, the next sequencer voice used `18ea1aee/f92555a2`, Lead source hash `a3f0b178/8a6bada6 -> abdb703d/e3859756`, and the triggered Lead voice used `abdb703d/e3859756` while transport stayed running.

Batch exit status:
- complete for the source preset full-snapshot hot-swap repair and automated proof.

State-authority invariant status:
- restored for automated coverage of running Pad/Lead preset hot-swaps. Preset loads and unsafe Pad/Lead endpoint/body changes now play from one resolved ProductControl state represented by visible sliders, then encoded as a full Product snapshot before trigger-visible source hashes change.
- Preset morph remains continuous and does not force a sequencer clock rejoin.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host/port streamlining, CPU optimization, granular retuning, and reverb retuning were not included.
- Existing unrelated dirty and untracked files were left in place.

Next batch:
- Manual in-app verification of the exact gesture sequence on local hardware: start Pad sequencer, toggle the sub-sequencer morph path on/off, change Pad preset A/B, move Pad preset morph, then change Lead preset morph while Pad is sequencing. If an audible issue remains, capture the latest browser hot-swap report plus Product debug console records for the failing gesture.

## Running Preset Hot-Swap Audio Parity Proof - 2026-06-11

Changed files:
- `src/audio/sonicParityHarness.ts`
- `src/presets/PresetStore.ts`
- `scripts/check-kessho-product-running-preset-hot-swap-audio-parity.mjs`
- `package.json`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Timed sonic-parity state events now resolve Pad preset/morph patches through the same Pad preset-body resolver used for initial capture state before forwarding Product Core snapshot patches.
- Lead-only timed events stay Lead-only, so they do not drag unrelated resolved Pad body values into the source-change classification.
- LocalStorage preset reads now return empty/null when browser storage is unavailable, which lets Node ProductControl regressions fall back to embedded Lead presets instead of throwing on `localStorage`.
- Added `core:product:hot-swap-audio-parity`, a browser graph-capture proof that records running Lead 1 and Pad 1 dry stems after source preset hot-swaps and compares the post-swap audio against a target baseline.

Validation run:
- `npm run core:product:hot-swap-audio-parity`: pass
- `npm run core:product:hot-swap-debug`: pass
- `npm run core:product:resolved-state`: pass
- `npm run core:product:state-authority`: pass
- `npm run type-check`: pass
- `git diff --check`: pass

Audio proof:
- Lead 1 running preset hot-swap uses a fresh-target baseline. Hot and baseline source state/compiled hashes both resolved to `db78b71e/95656dc7`; post-swap RMS ratio was `0.9956`; envelope correlation was `0.9921`.
- Pad 1 running preset hot-swap uses an immediate-hot-swap baseline on the same Product event path. Hot and baseline source state/compiled hashes both resolved to `2cc76075/211290d1`; post-swap RMS ratio was `0.9997`; envelope correlation was `1.0000`.
- Both hot captures reported `source-structure-change` full snapshot reloads while the Euclidean lanes remained running.

Batch exit status:
- complete for automated audio-side proof that running Pad/Lead preset hot-swaps rebuild audible source output without a stop/start cycle.

## Morph Sub-Lane Runtime Lock Release - 2026-06-09

Changed files:
- `src/ui/synth/SynthPage.tsx`
- `src/ui/useSelectedAudioEngineRuntimeValueCleanup.ts`
- `scripts/check-kessho-product-running-sequencer-live-updates.mjs`
- `docs/product-core/state-authority-ledger.md`

web-ts touched:
- no

Behavior changes:
- Explicitly disabling a Synth morph sub-lane now clears the stale runtime morph value for the source it was driving, so Pad preset morph sliders unlock immediately after the sub-sequencer morph lane is turned off.
- Retargeting an enabled morph sub-lane to a different source also releases the old source's runtime morph lock unless another enabled morph lane still targets that same source.
- Stopped-playback runtime cleanup now includes `padMorph` and `pad2Morph`.
- Inactive `-1` live-trigger sentinels still do not clear morph latches between triggers, preserving the prior snap-back fix.

Validation run:
- `npm run core:product:running-sequencer-live-updates`: pass
- `npm run type-check`: pass
- `npm run core:product:state-authority`: pass
- `npm run core:product:hot-swap-debug`: pass
- `git diff --name-only -- src/audio/reference/webTs`: pass, no output

Manual/audio tests:
- No human listening pass was performed in the app during this batch.
- Automated coverage is static/regression-level for the unlock path and browser-level for preserving running preset hot-swap behavior.

Batch exit status:
- complete for the reported preset morph slider lock after turning morph sub-sequencer off.

State-authority invariant status:
- maintained. Runtime morph values remain sequencer-owned while an enabled morph sub-lane is active, and manual slider authority is restored when that sub-lane is explicitly disabled or retargeted.

Parallel coordination notes:
- `src/audio/reference/webTs/**` remained untouched.
- No web-ts production fallback was introduced.
- Broad App/host/port streamlining, CPU optimization, granular retuning, and reverb retuning were not included.
- Existing unrelated dirty and untracked files were left in place.

Next batch:
- Manual in-app verification: enable a Pad morph sub-lane, start the sequencer until the Pad morph slider locks, turn the morph sub-lane off while transport continues, and confirm the Pad morph slider unlocks without snapping the sequencer playhead.
