# Product-Core State Authority and Running Sequencer Correctness Plan

## Mission

Fix the product-core state-authority bugs that cause these user-visible failures:

```text
- Synth parameter changes do not audibly update while the sequencer is running.
- Preset changes do not update the sound while the sequencer is running.
- Preset morph / sub-sequencer / ratchet behavior is buggy or absent.
- Manual, sequenced, ratcheted, morphed, and preset-driven triggers can play from stale state.
```

This is **not** a general cleanup pass. This is a correctness pass.

The central invariant is:

```text
Every sound-affecting trigger must play from one resolved parameter state:
the same resolved state represented by the visible sliders after preset, morph,
endpoint, drum-morph, sub-sequencer, and override resolution.
```

No trigger should use stale Product Core state, hidden module-level state, or per-event sound parameters that are not reflected in the resolved UI state unless the UI explicitly presents them as runtime modulation overlays.

---

## Hard rules

```text
1. Do not modify src/audio/reference/webTs/**.
2. Do not use web-ts as a production fallback.
3. web-ts may only be read or run for A/B comparison and parity reference.
4. Product-core fixes must be implemented in product-core, product host, C++ Product Core, generated ProductEvents, or product UI state.
5. Do not “fix” product-core by changing web-ts behavior.
6. Do not perform broad App.tsx/host streamlining until state authority and running-sequencer tests pass.
7. Do not optimize CPU before the state authority bug is fixed.
8. Do not add new hidden state authorities.
9. Do not post a sound-affecting trigger until the resolved state revision for that trigger has been committed or enqueued before the trigger with a clear order guarantee.
```

---

## Glossary

### Raw slider state

The current UI slider/control values before resolving morph endpoints, preset A/B interpolation, drum morph, sequencer intent, or overrides.

### Control state

The canonical product-side control model that owns:

```text
- raw sliders
- synth morph endpoint A
- synth morph endpoint B
- synth morph position
- drum morph endpoint A
- drum morph endpoint B
- drum morph position
- endpoint edits
- visible mid-morph override state, if supported
- sequencer UI intent
- product overrides
```

### Resolved performance state

The one resolved state that must be true for both UI and Product Core:

```ts
type ResolvedPerformanceState = {
  sliders: SliderState;          // exactly what UI should show
  productPatch: ProductSnapshotPatch;
  productEvents?: readonly ProductEvent[];
  revision: number;
  reason: ProductSnapshotPatchReason | ProductControlActionReason;
  triggerCritical: boolean;
};
```

### Revision

A monotonically increasing integer assigned to every resolved performance state. Sound-affecting triggers must be associated with the revision they are supposed to play from.

### Trigger-critical change

A change that can affect the next sound-producing event:

```text
- synth parameter change while transport is running
- drum parameter change while transport is running
- preset load
- morph endpoint replacement
- morph position change
- endpoint edit at A/B
- drum morph edit
- sequencer lane/sub-lane edit
- ratchet edit
- step override edit
- manual note audition immediately after slider drag
- chord audition
- sequencer trigger
```

Trigger-critical changes must be immediate or revision-ordered. They must not rely on the normal 33 ms product-core batching path.

---

## Files to inspect first

Run these before editing:

```bash
rg "CORE_PRODUCT_PARAM_UPDATE_INTERVAL_MS|scheduleAudioEngineParamUpdate|updateSnapshotPatch" src/ui src/audio/product -g '*.{ts,tsx}'
rg "externalState|trigger.*external|triggerVoice|enqueueEvent|manual trigger|audition" src/ui src/audio cpp/KesshoCore -g '*.{ts,tsx,cpp,h}'
rg "applySequencerUiPatch|subLane|sub-lane|ratchet|stepOverride|preset morph|morph" src/ui src/audio/product cpp/KesshoCore -g '*.{ts,tsx,cpp,h}'
rg "drumMorphOverrides|drumMorphDualRangeOverrides|module-level|let .*Override|var .*Override" src/audio src/ui -g '*.{ts,tsx}'
rg "ratchet|pending|emitted_hit_count|event_sample|block_start|block_end" cpp/KesshoCore/src/product/sequencer cpp/KesshoCore/include cpp/KesshoCore/tests -g '*.{cpp,h}'
```

---

# Batch 0 — Baseline proof and guardrails

## Goal

Confirm the branch and create a ledger for this state-authority effort.

## Create

```text
docs/product-core/state-authority-ledger.md
```

Suggested format:

```md
# Product-Core State Authority Ledger

## Baseline

| Item | Status | Evidence |
|---|---|---|
| web-ts untouched | pending | |
| ProductEngineProxy production path | pending | |
| root src/audio/engine.ts absent or non-production | pending | |
| root src/audio/runtime.ts absent or non-production | pending | |
| current running-sequencer bugs reproduced | pending | |
| ratchet cross-block bug reproduced | pending | |

## Batch status

| Batch | Status | Validation | Notes |
|---|---|---|---|
| 0 Baseline proof | pending | | |
| 1 Ratchet scheduler fix | pending | | |
| 2 ResolvedPerformanceState resolver | pending | | |
| 3 Revisioned product commit barrier | pending | | |
| 4 Atomic preset/morph/endpoint transactions | pending | | |
| 5 Sequencer patch bridge and hidden authority cleanup | pending | | |
| 6 Running-sequencer interaction gate | pending | | |
| 7 Final state-authority signoff | pending | | |
```

## Commands

```bash
git rev-parse --short HEAD
git status --short

git diff -- src/audio/reference/webTs || true
git ls-files src/audio/engine.ts src/audio/runtime.ts

npm run type-check
npm run migration:product-boundary
npm run core:product:reference-isolation
```

## Reproduce current bugs

Record manual or automated reproduction steps for:

```text
[ ] synth param changes do not audibly affect sound while sequencer is running
[ ] preset load does not audibly affect sound while sequencer is running
[ ] preset morph / morph sub-sequencer is stale or inconsistent
[ ] ratchet does not emit all subhits
[ ] manual audition immediately after slider drag can play stale state
```

## Exit criteria

```text
[ ] web-ts has no diff.
[ ] current bugs are recorded.
[ ] state-authority-ledger.md exists.
[ ] validation commands above pass or failures are recorded.
```

---

# Batch 1 — Fix C++ ratchet scheduling across audio blocks

## Goal

Ratchet subhits must emit correctly even when later subhits fall in future audio blocks.

## Why this matters

A parent step may fall in one audio block while ratchet subhits fall in later blocks. If ratchets are generated only when the parent step sample is inside the current block, later subhits are skipped.

## Primary files

Likely files:

```text
cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp
cpp/KesshoCore/src/product/sequencer/DrumSequencer.cpp, if drum ratchets have similar logic
cpp/KesshoCore/src/product/ProductSequencerState.h
cpp/KesshoCore/tests/*Sequencer*.cpp
cpp/KesshoCore/tests/ProductSequencer*.cpp
scripts/check-kessho-product-sequencer*.mjs, if present
```

## Implementation model

### Add pending ratchet event state

Add a small pending-event queue to lane state or sequencer runtime state.

Example shape:

```cpp
struct PendingRatchetEvent {
  uint64_t parent_step_id = 0;
  uint64_t absolute_sample = 0;
  uint32_t lane_index = 0;
  uint32_t step_index = 0;
  uint32_t ratchet_index = 0;
  uint32_t ratchet_count = 1;

  // Store the resolved event payload so probability/voice/note
  // decisions are not re-evaluated every block.
  KesshoSequencerEvent event = {};
};
```

The queue must be bounded.

```cpp
static constexpr uint32_t kMaxPendingRatchetsPerLane = 128;
```

If the queue overflows:

```text
- do not crash
- increment a diagnostic/drop counter
- preserve realtime safety
- prefer dropping oldest future ratchets over blocking the audio thread
```

### Resolve parent hit once

Pseudo-code:

```cpp
if (parent_step_enters_this_block) {
  ParentHit hit = resolveParentHitOnce(lane, step_id, relative_step);

  // Probability/trig condition/voice/note/morph decisions happen once here.
  if (!hit.should_emit) {
    return;
  }

  const uint32_t ratchet_count = clamp(hit.ratchet_count, 1u, kMaxRatchetCount);
  const double spacing = samples_per_step / double(ratchet_count);

  for (uint32_t i = 0; i < ratchet_count; ++i) {
    PendingRatchetEvent pending;
    pending.parent_step_id = hit.parent_step_id;
    pending.absolute_sample = hit.parent_sample + uint64_t(std::llround(spacing * i));
    pending.ratchet_index = i;
    pending.ratchet_count = ratchet_count;
    pending.event = hit.toSequencerEvent();
    pending.event.ratchet_index = i;
    pending.event.ratchet_count = ratchet_count;
    lane.pending_ratchets.push(pending);
  }

  lane.emitted_hit_count += 1;
}
```

### Drain every audio block

Pseudo-code:

```cpp
void drainPendingRatchets(
  LaneState& lane,
  uint64_t block_start,
  uint64_t block_end,
  std::vector<KesshoSequencerEvent>& out
) {
  for each pending in lane.pending_ratchets:
    if (pending.absolute_sample >= block_start && pending.absolute_sample < block_end) {
      pending.event.sample_offset = uint32_t(pending.absolute_sample - block_start);
      out.push_back(pending.event);
      mark pending consumed;
    }

  remove consumed events;
  remove stale events with absolute_sample < block_start;
}
```

### Important correctness rules

```text
[ ] Probability is evaluated once per parent step, not once per subhit.
[ ] Step trig condition is evaluated once per parent step.
[ ] Voice/note selection is evaluated once per parent step unless product design says otherwise.
[ ] emitted_hit_count increments once per parent step, not once per ratchet.
[ ] pending ratchets are cleared on reset.
[ ] pending ratchets are cleared on transport stop.
[ ] pending ratchets are cleared on seek/reposition.
[ ] pending ratchets are cleared or safely rebuilt after snapshot/preset load.
[ ] pending ratchets handle tempo/samples_per_step changes safely.
[ ] no duplicate subhits across blocks.
[ ] no missed later subhits.
```

## Tests to add

Add C++ tests covering:

```text
ratchet = 1, 2, 3, 4, 8
block size = 64, 128, 256
step duration spans multiple blocks
parent step at block boundary
parent step near end of block
transport stop clears pending
snapshot/preset load clears pending
tempo change clears or rebuilds pending
probability evaluated once per parent
emitted_hit_count increments once per parent
no duplicates across consecutive blocks
```

Test names should be explicit:

```text
ProductSequencerRatchetCrossBlockTest
ProductSequencerRatchetNoDuplicateAcrossBlocksTest
ProductSequencerRatchetClearsOnTransportStopTest
ProductSequencerRatchetProbabilityEvaluatedOnceTest
```

## Validation

```bash
npm run type-check
npm run core:product:sequencer
npm run core:product:determinism
npm run core:product:browser-runtime
```

If `core:product:sequencer` does not exist, run the closest existing sequencer/product-core test command and add a package script if appropriate.

## Exit criteria

```text
[ ] Ratchets emit all subhits across block boundaries.
[ ] No duplicated ratchet hits.
[ ] No stale pending ratchets after reset/stop/preset load.
[ ] Tests cover 1/2/3/4/8 ratchets and multiple block sizes.
[ ] web-ts untouched.
```

---

# Batch 2 — Create canonical ResolvedPerformanceState pipeline

## Goal

Create one pure resolver that determines the exact state the UI shows and Product Core receives.

Do this before changing lots of UI hooks. The resolver must be testable without audio.

## New files

Recommended new directory:

```text
src/product-control/
```

or, if the repo prefers UI-owned product state:

```text
src/ui/product-control/
```

Recommended files:

```text
src/product-control/ProductControlState.ts
src/product-control/ProductControlActions.ts
src/product-control/resolvePerformanceState.ts
src/product-control/controlReducer.ts
src/product-control/buildResolvedProductPatch.ts
src/product-control/ProductStateRevision.ts
src/product-control/__tests__/resolvePerformanceState.test.ts
```

Use the actual test framework already in the repo.

## Types

Start with explicit but pragmatic types. Do not over-engineer.

```ts
export type ProductControlRevision = number;

export type MorphEndpointState = {
  readonly presetId: string | null;
  readonly sliders: SliderState;
  readonly label?: string;
};

export type MorphState = {
  readonly presetA: MorphEndpointState;
  readonly presetB: MorphEndpointState;
  readonly position: number; // 0..1
};

export type MidMorphEditPolicy =
  | 'disallow-midpoint-edits'
  | 'visible-midpoint-override';

export type ProductControlState = {
  readonly rawSliders: SliderState;
  readonly synthMorph: MorphState;
  readonly drumMorph: MorphState;
  readonly sequencer: SequencerControlState;
  readonly overrides: ProductControlOverrides;
  readonly revision: ProductControlRevision;
};
```

If existing repo types differ, adapt names but keep the same concept.

## Actions

Create a single action union.

```ts
export type ProductControlAction =
  | { type: 'slider/edit'; key: string; value: unknown; triggerCritical?: boolean }
  | { type: 'preset/load'; presetId: string; sliders: SliderState }
  | { type: 'morph/position-set'; target: 'synth' | 'drum'; position: number; triggerCritical?: boolean }
  | { type: 'morph/endpoint-replace'; target: 'synth' | 'drum'; endpoint: 'A' | 'B'; presetId: string; sliders: SliderState }
  | { type: 'morph/endpoint-edit'; target: 'synth' | 'drum'; endpoint: 'A' | 'B'; key: string; value: unknown }
  | { type: 'morph/midpoint-edit'; target: 'synth' | 'drum'; key: string; value: unknown }
  | { type: 'sequencer/edit'; patch: ProductSequencerPatch; triggerCritical?: boolean }
  | { type: 'transport/edit'; patch: ProductTransportPatch; triggerCritical?: boolean }
  | { type: 'manual-trigger/request'; source: ProductSourceId }
  | { type: 'session/restore'; sliders: SliderState; morph?: Partial<ProductControlState> };
```

## Resolver

Implement:

```ts
export function reduceProductControlState(
  previous: ProductControlState,
  action: ProductControlAction,
): ProductControlState;

export function resolvePerformanceState(
  controlState: ProductControlState,
  options?: {
    reason?: ProductSnapshotPatchReason;
    triggerCritical?: boolean;
  },
): ResolvedPerformanceState;
```

`resolvePerformanceState()` must:

```text
[ ] interpolate synth morph A/B into resolved synth params
[ ] interpolate drum morph A/B into resolved drum params
[ ] apply endpoint edits
[ ] apply explicit visible mid-morph override layer if supported
[ ] apply sequencer intent only where it represents visible control state
[ ] build visible `sliders`
[ ] build product patch/events from the same resolved sliders
[ ] increment or preserve revision according to reducer rules
```

## Required behavior

### Preset load

```text
Action: preset/load
Expected:
- raw sliders replaced
- resolved sliders equal preset sliders
- productPatch represents preset sliders
- revision increments
- triggerCritical = true
```

### Morph position change

```text
Action: morph/position-set
Expected:
- morph position changes
- resolved sliders recompute from endpoint A/B
- productPatch represents recomputed sliders
- UI sliders equal resolved sliders
- revision increments
```

### Morph endpoint replacement while in the middle

```text
Action: morph/endpoint-replace at position 0.4
Expected:
- endpoint object replaced
- interpolation recomputed at 0.4 immediately
- UI sliders update immediately
- productPatch updates immediately
- no delayed effect required
```

### Endpoint edit

```text
If position is 0:
- slider edits mutate endpoint A

If position is 1:
- slider edits mutate endpoint B

If position is between 0 and 1:
- use chosen policy:
  A) reject edit and show UI instruction, or
  B) store a visible midpoint override layer
```

Do not silently mutate endpoint A/B from midpoint edits unless the product explicitly chooses that behavior.

### Drum morph

```text
- no module-level drum morph override is required for product-core path
- drum morph state lives in ProductControlState or endpoint state
```

## Tests

Add pure unit tests:

```text
resolve preset load
resolve morph position 0
resolve morph position 1
resolve morph position 0.5
replace endpoint A while position 0.4
replace endpoint B while position 0.4
edit endpoint A at position 0
edit endpoint B at position 1
midpoint edit policy
drum morph endpoint interpolation
revision increments on sound-affecting actions
revision does not increment on non-sound UI-only actions
```

## Validation

```bash
npm run type-check
npm test -- --runInBand resolvePerformanceState
```

If the repo does not use Jest/Vitest in this way, use the nearest existing test command.

Also run:

```bash
npm run core:product:patch-bridges
npm run core:product:dirty-diff
```

## Exit criteria

```text
[ ] ResolvedPerformanceState exists.
[ ] Resolver is pure.
[ ] Resolver is unit-tested.
[ ] Preset, morph, endpoint, drum morph, and revision cases pass.
[ ] web-ts untouched.
```

---

# Batch 3 — Add revisioned Product commit barrier

## Goal

No sound-affecting trigger can be posted before the Product Core runtime has received the resolved state revision it should play from.

## Core design

Add a commit operation:

```ts
export type ProductResolvedStateCommit = {
  readonly revision: number;
  readonly reason: ProductSnapshotPatchReason;
  readonly patch: ProductSnapshotPatch;
  readonly events?: readonly ProductEvent[];
  readonly triggerCritical: boolean;
};

export type ProductResolvedStateCommitReceipt = {
  readonly revision: number;
  readonly applied: boolean;
  readonly mode: 'event' | 'dirty-diff' | 'full-snapshot' | 'noop';
};
```

Add to ProductEnginePort or a capability surface:

```ts
commitResolvedState(commit: ProductResolvedStateCommit): Promise<ProductResolvedStateCommitReceipt>;
getCommittedStateRevision(): number;
```

If the project avoids promises in this path, use a synchronous receipt only if the state is truly applied synchronously before any trigger is queued.

## Files likely touched

```text
src/audio/product/ProductEnginePort.ts
src/audio/product/WebProductEngine.ts
src/audio/product/ProductEngineTypes.ts
src/audio/product/host/*
src/audio/coreProductEngineHost.ts
src/ui/useAudioEngineParamSync.ts
src/ui/useSelectedAudioEngineManualTriggers.ts
src/ui/usePresetEngineSync.ts
src/ui/useMorphPositionRuntimeSurface.ts
src/ui/useMorphSlotLoadRuntimeSurface.ts
```

## Ordering rule

For trigger-critical changes, one of these must be true:

### Preferred: same FIFO event queue

```text
enqueue resolved state ProductEvents
enqueue trigger event after those events
Product Core processes FIFO
trigger sees new state
```

### Acceptable: synchronous host commit

```text
host applies dirty-diff/snapshot immediately
host increments committed revision
trigger event posted after commit receipt
```

### Acceptable: async worklet ack

```text
post state commit to worklet
wait for productStateCommitted(revision)
then post trigger event
```

### Not acceptable

```text
schedule patch for later
post trigger now
hope Product Core catches up
```

## New helper

Create:

```text
src/product-control/commitResolvedState.ts
```

Suggested API:

```ts
export async function commitResolvedStateForProduct(
  productEngine: ProductEnginePort,
  resolved: ResolvedPerformanceState,
): Promise<ProductResolvedStateCommitReceipt> {
  return productEngine.commitResolvedState({
    revision: resolved.revision,
    reason: resolved.reason,
    patch: resolved.productPatch,
    events: resolved.productEvents,
    triggerCritical: resolved.triggerCritical,
  });
}
```

## Trigger-critical wrapper

Create:

```ts
export async function commitThenTrigger<T>(
  productEngine: ProductEnginePort,
  resolved: ResolvedPerformanceState,
  trigger: (revision: number) => Promise<T> | T,
): Promise<T> {
  const receipt = await commitResolvedStateForProduct(productEngine, resolved);
  if (!receipt.applied && resolved.triggerCritical) {
    throw new Error(`Product state revision ${resolved.revision} was not committed before trigger`);
  }
  return trigger(resolved.revision);
}
```

## Patch existing trigger paths

Replace patterns like:

```ts
productEngine.triggerSomething(...externalState...)
```

or:

```ts
productEngine.enqueueEvent(triggerEvent)
```

with:

```ts
const action = createControlActionFromCurrentUi(...);
const nextControlState = reduceProductControlState(prevControlState, action);
const resolved = resolvePerformanceState(nextControlState, {
  reason: 'manual-trigger',
  triggerCritical: true,
});

await commitThenTrigger(productEngine, resolved, (revision) => {
  return productEngine.enqueueEvent({
    ...triggerEvent,
    requiredStateRevision: revision, // if event schema supports it
  });
});
```

If ProductEvent schema does not support `requiredStateRevision`, the revision can remain host-side at first, but the commit-before-trigger ordering still must be enforced and tested.

## Batching rule

Keep 33 ms batching only for non-trigger-critical UI drags.

```text
Allowed 33 ms batching:
- non-running UI drags where no trigger can fire before commit
- non-audible visual-only changes
- telemetry-only UI updates

Not allowed:
- sequencer running
- manual audition
- chord audition
- preset load
- morph endpoint replacement
- morph position change while transport is running
- ratchet/sub-lane edits
- any edit immediately followed by a trigger
```

## Diagnostics to add

Expose in product diagnostics:

```text
lastResolvedRevision
lastCommittedRevision
lastTriggeredRevision
pendingCommitCount
lastCommitReason
lastCommitMode
triggerBeforeCommitCount
commitThenTriggerCount
staleTriggerBlockedCount
```

## Validation

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
```

## Exit criteria

```text
[ ] commitResolvedState API or equivalent exists.
[ ] trigger-critical actions bypass delayed batching.
[ ] manual triggers commit latest resolved state first.
[ ] diagnostics expose revision order.
[ ] web-ts untouched.
```

---

# Batch 4 — Atomic preset, morph, endpoint, and drum-morph transactions

## Goal

All preset/morph/endpoint operations must be one transaction:

```text
control action
-> resolve state
-> update visible sliders
-> commit Product state
-> allow triggers
```

## Files likely touched

```text
src/ui/usePresetEngineSync.ts
src/ui/useMorphSlotLoadRuntimeSurface.ts
src/ui/useMorphPositionRuntimeSurface.ts
src/ui/useMorphEndpointStatePatch.ts
src/ui/useAudioEngineParamSync.ts
src/audio/drumMorph.ts
src/product-control/*
```

## Required behavior by case

### Preset load while sequencer is running

```text
[ ] one `preset/load` action
[ ] resolved sliders update immediately
[ ] Product state revision commits immediately
[ ] sequencer either uses next trigger revision or quantized boundary is explicit
[ ] no stale old-preset notes after commit point
```

### Morph position move

```text
[ ] morph position is the source control
[ ] resolved sliders are recomputed from endpoint A/B
[ ] visible sliders match resolved state
[ ] Product patch/events match same resolved state
[ ] if sequencer is running, commit is trigger-critical
```

### Preset A/B replacement while morph is between endpoints

```text
[ ] endpoint object replaced
[ ] interpolation recomputed at current position immediately
[ ] visible sliders update immediately
[ ] Product state commits immediately
[ ] no later effect/hook required for Product state to catch up
```

### Endpoint edits

```text
position 0:
- edit mutates endpoint A
- resolved state recomputed
- Product committed

position 1:
- edit mutates endpoint B
- resolved state recomputed
- Product committed

position between 0 and 1:
- either disallow and show UI message
- or store explicit visible midpoint override layer
- do not silently mutate both endpoints
```

### Drum morph

```text
[ ] move module-level drum morph overrides into ProductControlState or explicit endpoint state
[ ] product-core path does not depend on hidden drumMorph.ts module variables
[ ] drum morph resolution is included in resolvePerformanceState()
```

## Remove special-case-only paths

Replace isolated sync paths with the central pipeline where feasible.

Instead of:

```text
preset hook schedules immediate snapshot
morph slot hook updates endpoint object
morph position effect later schedules patch
endpoint temp-save hook patches endpoint separately
drum morph module resolves hidden overrides separately
```

Move toward:

```text
commitControlAction(action)
  -> reduceProductControlState()
  -> resolvePerformanceState()
  -> set visible sliders
  -> commitResolvedState()
```

## Tests

Add unit tests and browser/runtime tests.

Unit:

```text
preset load increments revision
morph endpoint replacement mid-morph recomputes immediately
endpoint edit at A persists when moving away and back
endpoint edit at B persists when moving away and back
midpoint edit policy enforced
drum morph no hidden override dependency
```

Runtime/browser:

```text
preset load while running changes next notes
morph A replacement at 40% changes next notes
morph B replacement at 40% changes next notes
manual note after morph slider move uses new state
```

## Validation

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:browser-runtime
```

## Exit criteria

```text
[ ] Preset load is central transaction, not isolated special case.
[ ] Morph endpoint replacement mid-morph is atomic.
[ ] Morph position changes commit resolved sliders and Product state together.
[ ] Drum morph hidden authorities are removed or isolated from product-core path.
[ ] web-ts untouched.
```

---

# Batch 5 — Sequencer patch bridges and hidden authority cleanup

## Goal

Sequencer edits must update Product Core runtime state, host cache, and UI cache atomically.

## Files likely touched

```text
src/ui/useSelectedAudioEngineSequencerControls.ts
src/audio/product/WebProductEngine.ts
src/audio/product/host/CoreProductHostSequencer*.ts
src/audio/product/generated/*
cpp/KesshoCore/src/product/sequencer/*
cpp/KesshoCore/src/product/ProductSequencerState.h
cpp/KesshoCore/schema/kessho_product_events.schema.json
cpp/KesshoCore/schema/kessho_product_params.schema.json
```

## Priority paths

Replace or harden temporary `applySequencerUiPatch` paths for:

```text
[ ] ratchet
[ ] sub-lane enabled edits
[ ] sub-lane values/config
[ ] evolve config edits
[ ] pitch settings
[ ] step overrides
[ ] preset home snapshots
[ ] lane home capture/reset
[ ] preset morph sequencer edits
```

## ProductEvent batch model

Prefer generated ProductEvent batches:

```ts
productEngine.enqueueEvents([
  createSetSequencerSubLaneEnabledEvent(...),
  createSetSequencerSubLaneValueEvent(...),
  createSetSequencerCacheRevisionEvent(...),
]);
```

A single UI operation should produce a single atomic event batch.

## Cache consistency rule

After a sequencer edit:

```text
UI cache == host cache == Product Core runtime state
```

Add revision fields if needed:

```text
sequencerUiRevision
hostSequencerCacheRevision
productSequencerRuntimeRevision
lastAppliedSequencerEventRevision
```

## Preset morph subsequencer policy

If the product invariant is “sliders are truth”:

```text
Preset morph subsequencer must emit morph-position control changes.
It must not directly pass hidden per-event morph/distance/expression into triggerVoice.
```

If a lane intentionally modulates voice parameters:

```text
It must be represented as an explicit runtime modulation overlay in the UI/debug state.
It must not pretend the static sliders are the exact active value.
```

## External state trigger cleanup

Remove normal-use reliance on arbitrary `externalState` in trigger paths.

Manual, keyboard, chord, harmony, random, Euclidean, drum, and morph subsequencer triggers should use:

```text
latest committed Product state revision
```

not:

```text
ad hoc external UI state passed to the trigger
```

Cold-start bootstrap may still need a controlled external initial state, but ordinary operation should not.

## Tests

Add tests:

```text
sub-lane enabled edit while running updates runtime
ratchet edit while running updates runtime
pitch override edit while running updates runtime
step override edit while running updates runtime
preset morph sequencer emits morph-position transaction
home capture updates UI/host/Product consistently
manual trigger after slider drag uses committed Product state
```

## Validation

```bash
npm run type-check
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:browser-runtime
```

## Exit criteria

```text
[ ] Temporary sequencer patch bridges are removed where generated events can handle them.
[ ] Remaining bridges have tickets and do not affect running-state correctness.
[ ] Ratchet/sub-lane/preset morph changes work while running.
[ ] UI/host/Product sequencer caches agree.
[ ] normal triggers no longer rely on externalState to patch stale state.
[ ] web-ts untouched.
```

---

# Batch 6 — Running-sequencer live-update gate

## Goal

Add automated proof that live product-core changes affect sound/runtime state while the sequencer is running.

## Create script

Recommended:

```text
scripts/check-kessho-product-running-sequencer-live-updates.mjs
```

Package script:

```json
{
  "scripts": {
    "core:product:running-sequencer-live-updates": "node scripts/check-kessho-product-running-sequencer-live-updates.mjs"
  }
}
```

## Required diagnostics

The script needs access to product diagnostics or test hooks for:

```text
current resolved revision
last committed revision
last triggered revision
last patch reason
last dirty-diff mode
last event types enqueued
last sequencer event debug payload
last emitted note count
last ratchet count
last morph position
last preset id/hash
last source param hash
last rendered/audio debug hash if available
```

If a rendered audio assertion is hard to implement at first, use product debug event payloads and telemetry first, then add audio metrics later.

## Test cases

### 1. Synth param while running

```text
1. start core-product runtime
2. start sequencer
3. set a clearly audible synth param
4. wait one or two sequencer triggers
5. assert:
   - resolved revision incremented
   - committed revision >= resolved revision
   - next triggered revision >= committed revision
   - source param hash changed
   - no fallback/full snapshot violation
```

### 2. Preset load while running

```text
1. start sequencer
2. load preset A
3. wait for trigger
4. load very different preset B
5. assert:
   - visible slider hash changed
   - Product state revision changed immediately
   - next triggers use new revision
   - product param hash matches preset B
```

### 3. Morph endpoint replacement mid-morph

```text
1. set morph position to 0.4
2. load/replace endpoint A
3. assert resolved sliders update immediately
4. assert Product revision updates immediately
5. assert next trigger uses new revision
6. repeat for endpoint B
```

### 4. Ratchet cross-block

```text
1. set ratchet = 2, 3, 4, 8
2. use block sizes 64, 128, 256 where possible
3. assert all subhits appear
4. assert no duplicates
5. assert pending queue drains
```

### 5. Preset morph subsequencer

```text
1. start sequencer
2. enable preset morph subsequencer
3. assert morph position changes
4. assert visible sliders update from resolver
5. assert Product revision follows
6. assert triggers use that revision
```

### 6. Manual audition after slider drag

```text
1. drag a synth param
2. immediately trigger manual note
3. assert trigger uses the dragged value
4. assert no stale revision trigger occurs
```

### 7. Sub-lane / pitch / step override

```text
1. start sequencer
2. edit sub-lane enabled
3. edit pitch/step override
4. assert UI cache, host cache, Product runtime state agree
5. assert emitted events reflect the edit
```

## Validation

```bash
npm run type-check
npm run core:product:running-sequencer-live-updates
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:browser-runtime
npm run migration:runtime-production-gates
```

## Exit criteria

```text
[ ] running-sequencer-live-updates gate exists.
[ ] synth param changes affect next triggers while running.
[ ] preset load affects next triggers while running.
[ ] morph endpoint replacement affects next triggers while running.
[ ] ratchets work across block boundaries.
[ ] preset morph subsequencer uses central resolved state.
[ ] manual trigger after slider drag uses latest state.
[ ] web-ts untouched.
```

---

# Batch 7 — Final state-authority signoff

## Goal

Prove the state-authority update is complete and safe.

## Required commands

```bash
npm run type-check
npm run core:product:sequencer
npm run core:product:determinism
npm run core:product:patch-bridges
npm run core:product:dirty-diff
npm run core:product:snapshot-authority
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:browser-runtime
npm run core:product:running-sequencer-live-updates
npm run migration:runtime-production-gates
npm run migration:product-boundary
npm run core:product:reference-isolation
```

If some scripts do not exist, either add them in earlier batches or document the nearest equivalent.

## Source checks

```bash
git diff -- src/audio/reference/webTs
rg "externalState" src/ui src/audio/product -g '*.{ts,tsx}'
rg "applySequencerUiPatch" src/ui src/audio/product -g '*.{ts,tsx}'
rg "triggerVoice\\(|morph|distance|expression" cpp/KesshoCore/src/product/sequencer -g '*.{cpp,h}'
```

Leftovers must be classified:

```text
externalState:
- allowed only for cold-start/bootstrap, not normal triggers

applySequencerUiPatch:
- allowed only for ticketed non-running paths or deprecated compatibility path

per-event morph/distance/expression:
- allowed only if represented as visible runtime modulation overlays
- forbidden for preset morph if sliders are supposed to be truth
```

## Final acceptance

```text
[ ] Every sound-affecting action goes through the resolver or an explicitly approved Product Core event path.
[ ] Every trigger has a committed revision or FIFO ordering guarantee.
[ ] No trigger-critical action relies on delayed 33 ms batching.
[ ] Preset/morph/endpoint/drum morph transactions are atomic.
[ ] Ratchets work across audio block boundaries.
[ ] Sequencer caches agree across UI, host, and Product Core.
[ ] Running-sequencer live-update gate passes.
[ ] web-ts untouched.
```

---

# What should not be done in this update

Do not start these until Batch 7 passes:

```text
- broad App.tsx decomposition
- ProductEnginePort capability split
- WebProductEngine adapter compression
- coreProductEngineHost large refactor
- CPU governor retuning
- granular/reverb sonic retuning
- native/background audio work
```

Reason:

```text
If the engine can still play stale state, optimizing or streamlining will hide the core bug and make regressions harder to debug.
```

---

# Parallel-agent guidance

This update has a strict dependency order. Be careful with parallelism.

## Safe parallel work

### Agent A — Ratchet C++ owner

Can start Batch 1 immediately.

Owns:

```text
cpp/KesshoCore/src/product/sequencer/*
cpp/KesshoCore/src/product/ProductSequencerState.h
cpp/KesshoCore/tests/*Sequencer*
```

Must coordinate before changing shared ProductEvent schemas.

### Agent B — Resolver owner

Can start Batch 2 after Batch 0.

Owns:

```text
src/product-control/*
pure resolver tests
type definitions
```

Must not patch UI hooks until resolver tests pass.

### Agent C — Commit barrier owner

Can start design after Batch 2 types stabilize.

Owns:

```text
ProductEnginePort commit API
WebProductEngine commit implementation
host commit receipt/revision diagnostics
```

Must coordinate with Agent B for `ResolvedPerformanceState` types.

### Agent D — UI transaction owner

Starts after Batch 2 and Batch 3 interfaces are ready.

Owns:

```text
usePresetEngineSync
useMorphSlotLoadRuntimeSurface
useMorphPositionRuntimeSurface
useMorphEndpointStatePatch
useAudioEngineParamSync
manual trigger hooks
```

### Agent E — Sequencer bridge owner

Starts after Batch 1 and Batch 3.

Owns:

```text
useSelectedAudioEngineSequencerControls
CoreProductHostSequencer* bridges
generated sequencer ProductEvents
```

### Agent F — Gate owner

Can scaffold Batch 6 early, but final assertions require Batches 1–5.

Owns:

```text
scripts/check-kessho-product-running-sequencer-live-updates.mjs
package.json script entry
browser/runtime test fixtures
diagnostic report output
```

## Unsafe parallel work

Do not let two agents simultaneously edit:

```text
ProductEnginePort.ts
WebProductEngine.ts
coreProductEngineHost.ts
useAudioEngineParamSync.ts
useSelectedAudioEngineSequencerControls.ts
ProductSequencerState.h
SynthEuclidSequencer.cpp
```

without a coordination note in the ledger.

---

# Required report format after every batch

Use exactly this format:

```text
Batch:
- <batch number and name>

Agent:
- <agent id/name>

Changed files:
- ...

Existing dirty files modified:
- file: why it was safe/necessary

web-ts touched:
- no
- if yes, stop and explain why before continuing

Behavior changes:
- none
- or explicit list

Validation run:
- command: pass/fail
- command: pass/fail

Manual/audio tests:
- test: pass/fail/not run, reason

Batch exit criteria:
- complete/incomplete
- remaining blockers if incomplete

State-authority invariant status:
- preserved / still broken / not yet tested

Parallel coordination notes:
- files/areas other agents should avoid
- dependencies resolved or pending

Next batch:
- ...
```

---

# Coding-agent goal prompt

```text
Continue Product Core state-authority repair.

Goal:
Every trigger must play from one resolved parameter state: the same state represented by the visible sliders after preset, morph, endpoint, drum morph, sub-sequencer, and override resolution.

Do not modify src/audio/reference/webTs/**. web-ts is read-only A/B reference only.

Start with Batch 0 in docs/product-core/product-core-state-authority-plan.md, then proceed in order:
1. Fix ratchets across audio blocks.
2. Add pure ResolvedPerformanceState resolver.
3. Add revisioned Product state commit barrier.
4. Make preset/morph/endpoint/drum-morph operations atomic.
5. Replace or harden sequencer patch bridges and hidden state authorities.
6. Add running-sequencer live-update gate.
7. Run final state-authority signoff.

Do not do broad streamlining, CPU tuning, granular/reverb retuning, or native/background work until the running-sequencer live-update gate passes.

After every batch, update docs/product-core/state-authority-ledger.md and report with the required format.
```
