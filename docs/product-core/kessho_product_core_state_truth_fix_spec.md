# Kessho Product Core “Sliders Are Truth” Debug and Fix Plan

## Purpose

Fix the Product Core architecture so that the visible slider / preset / morph state is the only source of truth for sound. When transport or sequencers are running, changing any synth parameter, loading a Pad or Lead preset, changing morph endpoints, moving the morph slider, or changing sequencer/subsequencer state must immediately affect the next triggered sound according to the resolved visible sliders. The user must not need to stop and restart playback to hear the correct preset or parameter state.

This document is written for a coding agent with limited reasoning. Follow the phases in order. Do not skip the instrumentation phase. Do not declare the bug fixed because a host-level revision increments. The fix is only complete when the next C++ voice spawned by the running sequencer proves that it used the new source state revision and hash.

---

## Non-negotiable product invariant

The invariant is:

```text
Every sound-affecting trigger must use the exact same resolved parameter state that the sliders display.
```

This applies to:

- Pad sequencer.
- Lead sequencer.
- Drum sequencer.
- Keyboard audition.
- Chord audition.
- Harmony chord.
- Random sequencer.
- Euclidean sequencer.
- Preset morph slider.
- Preset morph subsequencer.
- Sequencer subsequences.
- Ratchets.
- Preset load while transport is running.
- Parameter edits while transport is running.

A valid implementation must guarantee this transaction order:

```text
User or sequencer action
  -> ProductControl canonical state changes
  -> resolved visible sliders are computed
  -> exact same resolved state is committed to Product runtime
  -> AudioWorklet/WASM confirms the state revision was applied
  -> C++ source descriptors / sequencer state reflect the revision
  -> next trigger spawns a voice from that revision
```

No sound-affecting path may bypass this pipeline.

---

## Important current symptoms to reproduce

Use these as the primary reproduction flows.

### Bug A: Pad preset does not fully update while sequencer is running

1. Select Pad source.
2. Start the Pad sequencer / transport.
3. Load a Pad preset A.
4. Without stopping playback, load a radically different Pad preset B.
5. Expected: the next newly triggered Pad voice should sound like preset B.
6. Current reported behavior: only Post LPF changes reliably; some envelope changes are partial; most Pad sound parameters stay old until stop/start.

### Bug B: Lead preset does not fully update while sequencer is running

1. Select Lead source.
2. Ensure subsequencer is off.
3. Start sequencer / transport.
4. Load Lead preset A.
5. Without stopping playback, load radically different Lead preset B.
6. Expected: next newly triggered Lead voice uses preset B.
7. Current reported behavior: sound does not change until stop/start.

### Bug C: Ratchet still happens when expression subsequencer is off

1. Create a sequence with ratchet values saved in step data.
2. Turn the expression subsequencer off.
3. Run sequencer.
4. Expected: ratchet behavior stops.
5. Current reported behavior: sequencer still causes ratchets.

---

## Repository areas likely involved

Search these paths in the local repo. If a file has moved, find the equivalent symbol and continue.

### ProductControl / state authority

- `src/product-control/ProductControlState.ts`
- `src/product-control/ProductControlActions.ts`
- `src/product-control/controlReducer.ts`
- `src/product-control/resolvePerformanceState.ts`
- `src/product-control/buildResolvedProductPatch.ts`
- `src/product-control/commitResolvedState.ts`
- `src/product-control/resolvePerformanceState.test.ts`

### UI commit paths

- `src/ui/useAudioEngineParamSync.ts`
- `src/ui/usePresetEngineSync.ts`
- `src/ui/useMorphPositionRuntimeSurface.ts`
- `src/ui/useMorphSlotLoadRuntimeSurface.ts`
- `src/ui/useMorphEndpointStatePatch.ts`
- `src/ui/useSelectedAudioEngineManualTriggers.ts`

### Product runtime / host

- `src/audio/product/ProductEnginePort.ts`
- `src/audio/product/ProductEngineTypes.ts`
- `src/audio/product/host/CoreProductResolvedStateCommitService.ts`
- `src/audio/product/host/CoreProductSnapshotCoordinator.ts`
- `src/audio/product/host/CoreProductPatchClassifier.ts`
- `src/audio/coreProductEngineHost.ts`
- `src/audio/coreProductRuntime.ts`
- `src/audio/coreProductSnapshot.ts`
- `src/audio/CoreProductRuntimeAdapter.ts`
- `src/audio/coreProductEvents.ts`

### Worklet and C++ Product Core

- `public/worklets/kessho-core-product.worklet.js`
- `cpp/KesshoCore/include/KesshoCore/...`
- `cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp`
- `cpp/KesshoCore/src/product/ProductState*`
- `cpp/KesshoCore/src/product/ProductSource*`
- `cpp/KesshoCore/src/product/sequencer/*Sequencer*.cpp`
- `cpp/KesshoCore/src/product/sequencer/SynthEuclidSequencer.cpp`
- `cpp/KesshoCore/src/product/sequencer/DrumEuclidSequencer.cpp`

### Product-core docs and diagnostics

- `docs/product-core/state-authority-ledger.md`
- existing `scripts/check-kessho-product-*.mjs` harnesses
- existing `npm run core:product:*` scripts

---

## Rules for the coding agent

1. Do not modify `web-ts` to fix production behavior. `web-ts` is reference/parity only.
2. Do not call the bug fixed based only on type-checks, revision increments, host receipts, or snapshot post counts.
3. Do not call the bug fixed based only on manual listening.
4. Add deterministic debug hashes and tests before making broad architecture changes.
5. Every new debug feature must be dev-only and gated, for example by `localStorage`, environment variable, or test-only harness flag.
6. Do not leave console spam enabled by default.
7. Do not allow ProductControl actions to advance sound revision unless the resolved output changes or the action is explicitly metadata-only.
8. Trigger-critical commits must not be considered actually applied until the AudioWorklet/WASM side confirms the revision was applied.
9. When the sequencer is running, the next newly spawned voice must use the newest committed source revision.
10. Existing ringing voices may either keep their old descriptor or be released/killed according to a documented policy. Newly spawned voices must never use stale descriptors after the new revision is applied.

---

# Phase 1 — ProductControl correctness audit and fixes

## Goal

Make ProductControl a real state authority, or at minimum make it impossible for ProductControl to claim that it committed a sound-affecting revision while the resolved sliders/product patch did not change.

The current design likely still behaves as a sidecar/reconciliation layer. It reads visible sliders, stores state in a per-engine map, resolves state, and emits a shallow slider patch. This is insufficient unless every sound-affecting action is folded into `resolvePerformanceState()` and the exact resolved sliders are pushed to both UI and Product Core.

## Phase 1A — Add invariant tests before changing behavior

Add or extend tests in:

```text
src/product-control/resolvePerformanceState.test.ts
```

Create a new `describe('ProductControl state authority invariants', ...)` block.

### Test 1: Morph keys must not default to an empty no-op set

Problem to test:

- `createInitialProductControlState()` may create morph states with `keys: []`.
- If `resolvePerformanceState()` treats any defined `keys` array as authoritative, then `keys: []` means “interpolate no keys.”
- This makes ProductControl morph a no-op unless some other layer populates keys, which violates single-source-of-truth.

Test shape:

```ts
it('interpolates endpoint keys when morph keys are empty', () => {
  const base = makeSliderState({ padPostLPF: 1000, padAttack: 0.1 });
  let state = createInitialProductControlState(base);

  state = reduceProductControlState(state, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'A',
    presetId: 'A',
    sliders: makeSliderState({ padPostLPF: 1000, padAttack: 0.1 }),
  });

  state = reduceProductControlState(state, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'B',
    presetId: 'B',
    sliders: makeSliderState({ padPostLPF: 5000, padAttack: 0.9 }),
  });

  state = reduceProductControlState(state, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0.5,
    triggerCritical: true,
  });

  const resolved = resolvePerformanceState(state);

  expect(resolved.sliders.padPostLPF).toBeCloseTo(3000);
  expect(resolved.sliders.padAttack).toBeCloseTo(0.5);
  expect(resolved.productPatch.padPostLPF).toBeCloseTo(3000);
  expect(resolved.productPatch.padAttack).toBeCloseTo(0.5);
});
```

Adjust exact key names to match the actual `SliderState` keys. Use real keys from `src/ui/state.ts`.

Success criterion:

- Test fails before fix if morph keys are empty and no interpolation happens.
- Test passes after fix.

Recommended fix:

```ts
function mergeMorphKeys(morph: MorphState): ProductControlSliderKey[] {
  if (morph.keys && morph.keys.length > 0) return [...morph.keys];

  const keys = new Set<ProductControlSliderKey>();
  for (const key of Object.keys(morph.presetA.sliders) as ProductControlSliderKey[]) keys.add(key);
  for (const key of Object.keys(morph.presetB.sliders) as ProductControlSliderKey[]) keys.add(key);
  return [...keys];
}
```

Alternative fix:

- Do not write `keys: []` into initial morph state. Leave `keys` undefined unless explicitly configured.

### Test 2: `sequencer/edit` must affect resolved product patch

Problem to test:

- `sequencer/edit` may update `controlState.sequencer.patch` but `resolvePerformanceState()` may ignore `controlState.sequencer.patch`.
- This allows ProductControl revision to advance while the patch sent to Product Core does not contain the sequencer changes.

Test shape:

```ts
it('folds sequencer edit patches into resolved product patch', () => {
  const base = makeSliderState({ synthEuclideanMasterEnabled: false });
  let state = createInitialProductControlState(base);

  state = reduceProductControlState(state, {
    type: 'sequencer/edit',
    patch: { synthEuclideanMasterEnabled: true },
    triggerCritical: true,
  });

  const resolved = resolvePerformanceState(state);

  expect(resolved.productPatch.synthEuclideanMasterEnabled).toBe(true);
  expect(resolved.sliders.synthEuclideanMasterEnabled).toBe(true);
});
```

Recommended fix options:

Option A, simplest:

```ts
case 'sequencer/edit':
  return commitState(
    previous,
    {
      ...previous,
      rawSliders: {
        ...previous.rawSliders,
        ...action.patch,
      } as ProductControlStateRecord,
      sequencer: {
        patch: {
          ...previous.sequencer.patch,
          ...action.patch,
        },
      },
    },
    'sequencer-control-change',
    action.triggerCritical ?? true,
  );
```

Option B, cleaner:

- Keep sequencer patch separate in state.
- Explicitly fold it into `resolvePerformanceState()` before building the product patch.
- Also set `resolved.sliders` for any sequencer fields that are visible sliders.

Do not use both without understanding duplication. The important thing is that the resolved product patch contains the effective sequencer values.

Success criterion:

- A `sequencer/edit` action cannot advance revision while producing a product patch that omits the edited values.

### Test 3: drum morph override actions must affect resolved output or be rejected as metadata-only

Problem to test:

- `drumMorphOverrides` can be updated by reducer actions.
- `resolvePerformanceState()` may ignore `drumMorphOverrides`.
- This allows revision to advance without audio state changing.

Test shape:

```ts
it('drum morph override changes resolved drum parameter output', () => {
  const base = makeSliderState({ /* real drum parameter key here */ });
  let state = createInitialProductControlState(base);

  state = reduceProductControlState(state, {
    type: 'drum-morph/override-set',
    voice: 'kick',
    param: 'pitch',
    value: 0.75,
    morphPosition: 0,
  });

  const resolved = resolvePerformanceState(state);

  expect(hashJson(resolved.productPatch)).not.toEqual(hashJson(buildResolvedProductPatch(base)));
});
```

Use real action payload types from `ProductControlActions.ts` and real drum keys.

Recommended fix:

- Either fold `drumMorphOverrides` into `resolvePerformanceState()` by converting override state into actual resolved drum slider keys before `buildResolvedProductPatch(sliders)`, or remove/reclassify these actions as non-sound-affecting metadata until they are consumed.
- If an action is sound-affecting and ignored, fail the test.

Success criterion:

- Any drum morph override action either changes `resolved.productPatch` or does not advance revision.

### Test 4: endpoint replacement at midpoint recalculates resolved sliders immediately

Problem to test:

When morph is at 0.4 or 0.5, replacing Preset A or Preset B must immediately recalculate visible/resolved slider values and product patch.

Test shape:

```ts
it('recomputes midpoint slider values when morph endpoint is replaced', () => {
  let state = createInitialProductControlState(makeSliderState({ padPostLPF: 1000 }));

  state = reduceProductControlState(state, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'A',
    presetId: 'A1',
    sliders: makeSliderState({ padPostLPF: 1000 }),
  });

  state = reduceProductControlState(state, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'B',
    presetId: 'B1',
    sliders: makeSliderState({ padPostLPF: 5000 }),
  });

  state = reduceProductControlState(state, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0.5,
    triggerCritical: true,
  });

  const before = resolvePerformanceState(state);
  expect(before.sliders.padPostLPF).toBeCloseTo(3000);

  state = reduceProductControlState(state, {
    type: 'morph/endpoint-replace',
    target: 'synth',
    endpoint: 'B',
    presetId: 'B2',
    sliders: makeSliderState({ padPostLPF: 9000 }),
  });

  const after = resolvePerformanceState(state);
  expect(after.sliders.padPostLPF).toBeCloseTo(5000);
  expect(after.productPatch.padPostLPF).toBeCloseTo(5000);
});
```

Success criterion:

- Changing Preset A/B while morph is between them recomputes sliders and product patch in the same transaction.

### Test 5: endpoint parameter edits are remembered after morphing away and back

Problem to test:

When morph position is exactly 0 or 100, parameter edits should modify endpoint A or endpoint B temporary state. Those edits become the new interpolation points.

Test shape:

```ts
it('edits endpoint A when morph is at A and preserves it after morph away/back', () => {
  let state = createInitialProductControlState(makeSliderState({ padPostLPF: 1000 }));

  state = reduceProductControlState(state, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0,
    triggerCritical: true,
  });

  state = reduceProductControlState(state, {
    type: 'morph/midpoint-edit',
    target: 'synth',
    key: 'padPostLPF',
    value: 2222,
  });

  state = reduceProductControlState(state, {
    type: 'morph/position-set',
    target: 'synth',
    position: 1,
    triggerCritical: true,
  });

  state = reduceProductControlState(state, {
    type: 'morph/position-set',
    target: 'synth',
    position: 0,
    triggerCritical: true,
  });

  const resolved = resolvePerformanceState(state);
  expect(resolved.sliders.padPostLPF).toBeCloseTo(2222);
});
```

Success criterion:

- Endpoint edits persist as interpolation endpoints.

### Test 6: sound-affecting action must change resolved output or be marked metadata-only

Create a helper test that checks representative actions:

```ts
function expectSoundActionChangesResolvedOutput(
  before: ProductControlState,
  action: ProductControlAction,
) {
  const beforeResolved = resolvePerformanceState(before);
  const after = reduceProductControlState(before, action);
  const afterResolved = resolvePerformanceState(after);

  if (after.revision !== before.revision) {
    expect(hashJson(afterResolved.productPatch)).not.toEqual(hashJson(beforeResolved.productPatch));
  }
}
```

Apply this to:

- `slider/edit`
- `slider/patch`
- `preset/load`
- `morph/position-set`
- `morph/endpoint-replace`
- `morph/endpoint-edit`
- `morph/midpoint-edit`
- `sequencer/edit`
- `transport/edit`
- `drum-morph/override-set`

Allow exceptions only if the reducer explicitly marks the action as `soundAffecting = false` and does not advance revision.

Success criterion:

- No sound-affecting ProductControl action can produce a false-positive revision.

---

## Phase 1B — Make ProductControl commit return resolved UI state

## Goal

The UI and Product Core must receive the same resolved state from the same transaction. ProductControl should not merely infer from already-mutated visible sliders.

### Required API direction

Add or evolve APIs so an action dispatch produces this object:

```ts
type ProductControlDispatchResult = {
  readonly controlState: ProductControlState;
  readonly resolved: ResolvedPerformanceState;
  readonly receipt: ProductResolvedStateCommitReceipt;
};
```

Then UI commit paths should use this exact flow:

```ts
const result = await productControl.dispatchAndCommit(action);
setSliderState(result.resolved.sliders);
```

If React state must be updated separately because of existing app architecture, document the temporary bridge clearly and add a TODO. But the result must include the resolved sliders.

### Minimum implementation if full UI refactor is too large

If fully changing UI ownership is too large for one pass, implement this lower-risk bridge:

1. Keep the existing `commitVisibleSliderStateForProduct()` API.
2. Make sure every call returns or exposes `resolved.sliders`.
3. Add an optional callback:

```ts
onResolvedSliders?: (sliders: SliderState, revision: number) => void;
```

4. Use that callback in preset/morph/sequencer paths where ProductControl is intended to be authoritative.

Success criterion:

- For preset load and morph endpoint replacement, the same resolved slider object is used to update UI and Product Core.
- There is no path where ProductControl computes a resolved value that is never displayed.

---

## Phase 1C — Replace shallow Product patches with semantic apply policy

Current behavior may build product patch as:

```ts
return { ...sliders };
```

This is acceptable only as a temporary compatibility layer. It is not enough to describe whether Product Core should apply a cheap param event, source rebuild, sequencer state update, or full snapshot.

### Add semantic patch classification

Create or extend a schema like:

```ts
type ProductApplyPolicy =
  | 'realtime-param'
  | 'source-rebuild'
  | 'sequencer-state'
  | 'transport-state'
  | 'full-snapshot';

type ProductParamDescriptor = {
  key: keyof SliderState;
  policy: ProductApplyPolicy;
  source?: 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'drum' | 'piano' | 'soundscape';
  triggerCritical: boolean;
};
```

At minimum, classify:

```text
preset-load                 -> full-snapshot or source-rebuild, not dirty diff
pad/lead preset identity    -> source-rebuild or full-snapshot
pad/lead oscillator/body    -> source-rebuild
pad/lead source override    -> source-rebuild
pad/lead compiled source    -> source-rebuild
sequencer step/lane state   -> sequencer-state
transport start/stop        -> transport-state
post LPF                    -> realtime-param, if already proven safe
gain/pan/sends              -> realtime-param, if already proven safe
envelope                    -> source-rebuild until proven safe live
```

Success criterion:

- Preset-load and Pad/Lead source-body changes never rely on generic dirty diff unless there is a specific parity test proving hot dirty-diff equals stop/start reload.

---

# Phase 2 — Add debug hashes and revision telemetry

## Goal

Locate the exact layer where state diverges.

The debug pipeline must prove these five values for a preset hot-swap while sequencer is running:

```text
1. ProductControl resolved slider/source hash
2. Encoded Product snapshot source hash
3. AudioWorklet/WASM snapshot-applied revision/hash
4. C++ active source descriptor hash
5. Next C++ voice-spawn source descriptor hash
```

Do not skip directly to a C++ source rebuild. First find which layer is stale.

---

## Phase 2A — Add deterministic TS hash helpers

Create:

```text
src/debug/productStateDebugHash.ts
```

Implementation:

```ts
export function fnv1a32Bytes(buffer: ArrayBuffer | Uint8Array): string {
  let hash = 0x811c9dc5;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

export function fnv1a32String(value: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

export function hashJson(value: unknown): string {
  return fnv1a32String(stableStringify(value));
}
```

Add tests:

```text
src/debug/productStateDebugHash.test.ts
```

Test:

- Object key order does not change hash.
- Byte hash is stable.
- Different source states produce different hashes.

Success criterion:

- Hash helpers are deterministic and dev/test safe.

---

## Phase 2B — Log ProductControl resolved hash

In `commitResolvedState.ts`, after `resolvePerformanceState(...)`, log a dev-only summary.

Create a helper:

```ts
function productStateDebugEnabled(): boolean {
  return (
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('kesshoProductStateDebug') === '1'
  );
}
```

Log fields:

```ts
{
  stage: 'product-control-resolved',
  revision: resolved.revision,
  reason: resolved.reason,
  triggerCritical: resolved.triggerCritical,
  applyMode: resolved.applyMode ?? null,
  sliderHash: hashJson(resolved.sliders),
  productPatchHash: hashJson(resolved.productPatch),
  padRelevantHash: hashJson(extractPadRelevantFields(resolved.sliders)),
  leadRelevantHash: hashJson(extractLeadRelevantFields(resolved.sliders)),
}
```

Implement `extractPadRelevantFields()` and `extractLeadRelevantFields()` using real Pad/Lead slider keys from `SliderState`. Include at minimum:

- preset ID / preset A / preset B fields
- morph field
- post LPF
- ADSR/hold/release fields
- oscillator/body/filter/timbre/source override keys
- any exact pad/lead patch fields used by `coreProductSnapshot.ts`

Success criterion:

- Loading preset A and B produces different `product-control-resolved` hashes.
- If the hash does not change, fix ProductControl/preset-load before touching runtime or C++.

---

## Phase 2C — Log encoded Product snapshot hash

In:

```text
src/audio/product/host/CoreProductSnapshotCoordinator.ts
```

At the point where `encodeCoreProductSnapshot(snapshot)` is called, capture:

```ts
const encodedSnapshot = encodeCoreProductSnapshot(options.snapshot);
```

Log dev-only fields:

```ts
{
  stage: 'encoded-product-snapshot',
  reason: options.reason,
  revision: options.revision ?? null,
  encodedSnapshotHash: fnv1a32Bytes(encodedSnapshot),
  encodedByteLength: encodedSnapshot.byteLength,
  pad1: summarizeSourceForDebug(snapshot.sources?.[0]),
  pad2: summarizeSourceForDebug(snapshot.sources?.[1]),
  lead1: summarizeSourceForDebug(snapshot.sources?.[2]),
  lead2: summarizeSourceForDebug(snapshot.sources?.[3]),
}
```

Use actual source order from `coreProductSnapshot.ts`. If source order has changed, import the source order constant rather than hardcoding indexes.

Example source summary:

```ts
function summarizeSourceForDebug(source: Record<string, unknown> | undefined) {
  if (!source) return null;

  const padOverrideBlock = {
    padOverrideCount: source.padOverrideCount,
    padOverrideIndices: source.padOverrideIndices,
    padOverrideValues: source.padOverrideValues,
  };

  const leadOverrideBlock = {
    leadOverrideCount: source.leadOverrideCount,
    leadOverrideIndices: source.leadOverrideIndices,
    leadOverrideValues: source.leadOverrideValues,
  };

  return {
    sourceId: source.sourceId,
    enabled: source.enabled,
    presetId: source.presetId,
    sourcePresetAId: source.sourcePresetAId,
    sourcePresetBId: source.sourcePresetBId,
    morph: source.morph,
    postLpfHz: source.postLpfHz,
    attackSeconds: source.attackSeconds,
    decaySeconds: source.decaySeconds,
    sustain: source.sustain,
    holdSeconds: source.holdSeconds,
    releaseSeconds: source.releaseSeconds,
    padOverrideHash: hashJson(padOverrideBlock),
    leadOverrideHash: hashJson(leadOverrideBlock),
    sourceSnapshotHash: hashJson(source),
  };
}
```

Success criterion:

- Loading Pad/Lead preset B while running produces a different encoded snapshot hash and source snapshot hash than preset A.
- If ProductControl hash changes but encoded snapshot hash/source hash does not, fix `coreProductSnapshot.ts` / snapshot builder.

---

## Phase 2D — Add revision metadata to snapshot messages

Currently `runtime.loadSnapshot(snapshot)` may only post `{ type: 'snapshot', snapshot }`. That is not enough to prove the snapshot corresponds to the ProductControl revision.

Change the API to carry metadata:

```ts
type ProductRuntimeSnapshotMetadata = {
  revision: number;
  reason: string;
  triggerCritical: boolean;
  encodedSnapshotHash: string;
};

loadSnapshot(snapshot: ArrayBuffer, metadata: ProductRuntimeSnapshotMetadata): Promise<ProductSnapshotAppliedReceipt>;
```

Receipt:

```ts
type ProductSnapshotAppliedReceipt = {
  revision: number;
  applied: true;
  encodedSnapshotHash: string;
  workletSourceSummaryHash?: string;
  appliedAtFrame?: number;
};
```

Implementation notes:

- Maintain a `Map<number, { resolve, reject, timeout }>` of pending snapshot acknowledgements in `coreProductRuntime.ts`.
- Include a timeout, for example 1000 ms in dev/test; do not hang forever.
- The worklet must post back `snapshot-applied` with the same revision and encoded hash.
- Host-level commit must not mark trigger-critical revision as applied until this ack is received.

Success criterion:

- Preset-load while running logs `snapshot-applied` for the same revision/hash that ProductControl committed.
- If encoded snapshot is posted but no ack arrives, fix worklet snapshot handling.

---

## Phase 2E — Apply snapshot at a deterministic audio block boundary

In:

```text
public/worklets/kessho-core-product.worklet.js
```

Do not apply trigger-critical snapshots ambiguously in a message handler while the process loop is in an unknown state.

Preferred model:

```js
onmessage snapshot:
  pendingSnapshots.push({ snapshot, metadata })

process(inputs, outputs, parameters):
  while pendingSnapshots not empty:
    apply snapshot before generating this block
    post snapshot-applied ack
  render block
```

If the current worklet already applies snapshots safely, still add the ack at the actual point where WASM has accepted the snapshot.

Success criterion:

- A snapshot ack means “WASM accepted this snapshot before rendering the block following the ack.”
- It does not merely mean “main thread posted a message.”

---

## Phase 2F — Add C++ source and voice-spawn debug telemetry

This is mandatory if the sound still does not change even though ProductControl and encoded snapshot hashes change.

Add dev/test-only debug telemetry in Product Core.

### Required C++ debug fields

Create a C++ struct or telemetry record equivalent to:

```cpp
struct ProductDebugSourceState {
  uint32_t source_id;
  uint32_t preset_id;
  uint64_t source_revision;
  uint32_t source_state_hash;
  uint32_t compiled_source_hash;
  uint32_t override_block_hash;
};

struct ProductDebugVoiceSpawn {
  uint32_t source_id;
  uint32_t voice_id;
  uint64_t trigger_sample;
  uint64_t trigger_revision;
  uint64_t source_revision;
  uint32_t preset_id;
  uint32_t source_state_hash;
  uint32_t compiled_source_hash;
  uint32_t override_block_hash;
};
```

### Where to log source state

Log after snapshot load has updated Product Core source state and after source compilation/override application.

Likely location:

```text
cpp/KesshoCore/src/product/KesshoProductSnapshot.cpp
```

Add debug hashing after operations equivalent to:

```text
assign source preset IDs
assign ADSR/source fields
compile source preset runtime
compile source preset endpoints
apply structured source overrides to module
mark Product state changed
```

### Where to log voice spawn

Log at the exact point where the sequencer/manual trigger creates a Pad/Lead voice descriptor. Search for functions like:

```text
triggerVoice
spawnVoice
startVoice
renderSource
voice allocation
```

At the voice spawn point, copy source revision/hash from the active source descriptor into debug telemetry.

Success criterion:

- For preset A then preset B while running, debug telemetry shows that newly spawned voices after B use B’s `source_revision`, `preset_id`, `source_state_hash`, and `compiled_source_hash`.
- If C++ active source hash changes but next voice spawn hash remains old, fix source descriptor / voice spawn cache.

---

# Phase 3 — Branch based on debug results

Run the reproduction after Phase 2.

## Required debug comparison table

For each test run, capture:

```text
Test name:
  Pad hot-swap while running / Lead hot-swap while running

Preset A:
  ProductControl resolved hash:
  Encoded snapshot hash:
  Source snapshot hash:
  Snapshot-applied revision/hash:
  C++ active source hash:
  Next voice source hash:

Preset B:
  ProductControl resolved hash:
  Encoded snapshot hash:
  Source snapshot hash:
  Snapshot-applied revision/hash:
  C++ active source hash:
  Next voice source hash:
```

## Branch 1 — ProductControl hash does not change

Diagnosis:

```text
Preset load or slider edit did not enter ProductControl correctly.
```

Fix these areas:

- `usePresetEngineSync.ts`
- `useAudioEngineParamSync.ts`
- `commitResolvedState.ts`
- `controlReducer.ts`
- `resolvePerformanceState.ts`
- Morph endpoint hooks

Likely fixes:

1. Ensure preset-load creates a `preset/load` ProductControl action with the full preset sliders.
2. Ensure `preset/load` updates `rawSliders`.
3. Ensure it resets or replaces morph endpoints only according to intended behavior.
4. Ensure it sets `reason: 'preset-load'`, `triggerCritical: true`, and `applyMode: 'full-snapshot'` or `source-rebuild`.
5. Ensure `resolved.sliders` differs from A to B.

Success criterion:

- ProductControl hash changes between A and B.
- ProductControl unit tests pass.

## Branch 2 — ProductControl hash changes but encoded snapshot hash does not

Diagnosis:

```text
ProductControl resolved state is correct, but snapshot builder is not encoding the changed values.
```

Fix these areas:

- `src/audio/coreProductSnapshot.ts`
- exact Pad/Lead patch extraction functions
- source preset identity mapping
- source override block builder
- morph-to-source mapping

Likely fixes:

1. Verify every Pad/Lead slider key that affects sound is consumed by snapshot builder.
2. Verify preset identity fields are encoded.
3. Verify `exactPadPatchFromState(...)` or equivalent includes all source-body parameters.
4. Verify Lead preset-data hydration is complete before commit.
5. Verify morph endpoint values are reflected in resolved sliders before snapshot build.

Success criterion:

- Encoded snapshot hash and Pad/Lead source hash change between preset A and B.

## Branch 3 — Encoded snapshot hash changes but worklet snapshot-applied ack does not arrive

Diagnosis:

```text
Main-thread runtime posted snapshot but AudioWorklet/WASM did not confirm application.
```

Fix these areas:

- `src/audio/coreProductRuntime.ts`
- `public/worklets/kessho-core-product.worklet.js`
- WASM snapshot C ABI error handling

Likely fixes:

1. Add ack messages from worklet.
2. Confirm worklet actually receives snapshot metadata.
3. Confirm `kessho_product_load_snapshot_v2` returns success.
4. If WASM returns an error, propagate it to host and fail tests.
5. Do not mark trigger-critical commit as applied on the host until ack arrives.

Success criterion:

- Every trigger-critical preset-load receives `snapshot-applied` ack for same revision/hash.

## Branch 4 — Worklet ack arrives but C++ active source hash does not change

Diagnosis:

```text
WASM accepted snapshot, but Product Core did not update the active source state or compiled source descriptor.
```

Fix these areas:

- `KesshoProductSnapshot.cpp`
- Product source state assignment
- source runtime compilation
- structured source override application
- ProductState dirty flags

Likely fixes:

1. Verify snapshot loader assigns all Pad/Lead fields.
2. Verify preset IDs and override blocks are read from snapshot correctly.
3. Verify source compilation runs when preset/body fields change.
4. Verify source dirty flags are set.
5. Verify active source descriptor is replaced or pending-swapped.

Success criterion:

- C++ active source hash changes after B snapshot.

## Branch 5 — C++ active source hash changes but next voice spawn hash remains old

Diagnosis:

```text
Source state updates, but running sequencer/voice spawn uses a stale cached source descriptor or old voice template.
```

Fix these areas:

- source runtime descriptor cache
- voice allocation/spawn code
- sequencer trigger -> voice path
- Pad/Lead renderer initialization

Required architecture:

```cpp
struct SourceDescriptor {
  uint64_t revision;
  uint32_t preset_id;
  uint32_t source_state_hash;
  uint32_t compiled_source_hash;
  // compiled source parameters / module data
};

struct ProductSourceRuntime {
  SourceDescriptor active;
  SourceDescriptor pending;
  bool has_pending;
};

void applyPendingSourceSwapsAtBlockStart(ProductState& state) {
  for (auto& source : state.sources) {
    if (source.has_pending) {
      source.active = std::move(source.pending);
      source.has_pending = false;
    }
  }
}

Voice spawnVoice(SourceId source_id, Trigger trigger) {
  const SourceDescriptor& descriptor = state.sources[source_id].active;
  Voice voice = Voice::fromDescriptor(descriptor, trigger);
  voice.source_revision = descriptor.revision;
  return voice;
}
```

Success criterion:

- The next newly spawned Pad/Lead voice after preset B uses B source revision/hash.

## Branch 6 — Voice spawn hash changes but audio still sounds old

Diagnosis:

```text
The correct descriptor reaches voice spawn, but renderer/DSP module does not apply it correctly.
```

Fix these areas:

- Pad renderer
- Lead renderer
- source module parameter application
- oscillator/filter/body model state
- voice initialization/reset code

Likely fixes:

1. Verify voice constructor copies all descriptor fields into DSP modules.
2. Verify filter/envelope/oscillator modules are reset or updated on descriptor change.
3. Verify old module instances are not reused without reinitialization.
4. Verify source override values affect DSP parameters, not only telemetry.

Success criterion:

- Graph/audio parity test shows hot update output differs from preset A and matches stop/start preset B output within acceptable tolerance.

---

# Phase 4 — Runtime architecture fix

## Goal

Replace host-assumed application with revisioned audio-thread acknowledgement.

## Required contract

```text
Main thread commits revision R
  -> runtime posts snapshot/transaction R
  -> worklet queues R
  -> worklet applies R at start of an audio block
  -> WASM/Product Core marks current control revision R
  -> worklet posts snapshot-applied R
  -> host marks R applied
  -> trigger-critical action may proceed
```

## TypeScript changes

### ProductEngineTypes

Add or extend:

```ts
export type ProductResolvedStateApplyMode =
  | 'event'
  | 'dirty-diff'
  | 'source-rebuild'
  | 'full-snapshot';

export type ProductResolvedStateCommitReceipt = {
  readonly revision: number;
  readonly applied: boolean;
  readonly mode: ProductResolvedStateApplyMode | 'deferred' | 'noop';
  readonly audioThreadApplied?: boolean;
  readonly encodedSnapshotHash?: string;
};
```

### CoreProductRuntime

Change:

```ts
loadSnapshot(snapshot: ArrayBuffer): void
```

to:

```ts
loadSnapshot(
  snapshot: ArrayBuffer,
  metadata: ProductRuntimeSnapshotMetadata,
): Promise<ProductSnapshotAppliedReceipt>
```

Add pending receipt map:

```ts
private pendingSnapshotReceipts = new Map<number, PendingSnapshotReceipt>();
```

On `snapshot-applied` message:

```ts
const pending = this.pendingSnapshotReceipts.get(message.revision);
if (pending) {
  pending.resolve(message);
  clearTimeout(pending.timeout);
  this.pendingSnapshotReceipts.delete(message.revision);
}
```

Success criterion:

- Runtime tests prove `loadSnapshot()` does not resolve until worklet ack arrives.

### CoreProductResolvedStateCommitService

Do not report `applied: true` for trigger-critical full snapshots until `loadSnapshot()` ack is resolved.

If current host APIs are synchronous, change them to async or introduce an explicit `pending` mode that trigger-critical callers must await. Do not fake success.

Success criterion:

- `commitProductControlActionThenTrigger()` cannot fire the trigger until Product Core acked the required revision.

---

# Phase 5 — Product Core hot source rebuild

## Goal

Changing Pad/Lead preset or source-body parameters while transport is running must rebuild/swap source state for future voices without requiring stop/start.

## Required C++ behavior

### Source revisions

Add a monotonically increasing source revision:

```cpp
struct ProductSourceState {
  uint64_t revision;
  uint32_t preset_id;
  // existing source fields
};
```

When any sound-affecting source field changes during snapshot load or source-rebuild event:

```cpp
source.revision = product_state.control_revision;
source.dirty = true;
```

### Source descriptor rebuild

Create or identify the compiled descriptor used by voices:

```cpp
struct ProductSourceDescriptor {
  uint64_t revision;
  uint32_t preset_id;
  uint32_t source_state_hash;
  uint32_t compiled_source_hash;
  // compiled oscillator/filter/body/envelope/source override params
};
```

On source dirty:

```cpp
source.pending_descriptor = compileDescriptorFromSourceState(source.state);
source.has_pending_descriptor = true;
```

At start of audio block:

```cpp
if (source.has_pending_descriptor) {
  source.active_descriptor = std::move(source.pending_descriptor);
  source.has_pending_descriptor = false;
}
```

At voice spawn:

```cpp
const auto& descriptor = source.active_descriptor;
voice.initFromDescriptor(descriptor, trigger);
voice.source_revision = descriptor.revision;
```

### Existing voice policy

Choose one and document it:

Policy A, simplest and safest:

```text
When source descriptor changes, release or kill existing active voices for that source.
```

Policy B, more musical:

```text
Existing voices keep their old descriptor; newly spawned voices use the new descriptor.
```

Policy B is acceptable only if debug telemetry proves newly spawned voices use the new revision.

Success criterion:

- Stop/start is no longer necessary for newly triggered voices to use the new preset.

---

# Phase 6 — Ratchet and expression subsequencer fixes

## Goal

Ratchets must not occur when the expression subsequencer is off, according to the current requested behavior.

## Phase 6A — Fix TS sublane gating

Find:

```text
CoreProductSequencerStepPostingBridge.ts
```

Search for the function that maps step-value fields to sublane keys. It likely maps:

```text
midiNote   -> pitch
expression -> expression
morph      -> morph
distance   -> distance
ratchet    -> missing/null
```

If `ratchet` maps to `null`, it may be treated as always enabled. Fix it.

Fast compatibility fix:

```ts
case CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet:
  return 'expression';
```

Cleaner long-term fix:

```ts
type ProductSequencerSubLaneKey =
  | 'pitch'
  | 'expression'
  | 'ratchet'
  | 'morph'
  | 'distance';
```

Then map:

```ts
case CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet:
  return 'ratchet';
```

If using a distinct ratchet sublane, update UI state and tests so turning ratchet off is explicit. For the current bug report, expression off must disable ratchet behavior.

Success criterion:

- With expression sublane off, ratchet step values are not posted or are explicitly cleared.

## Phase 6B — Clear stale runtime ratchet state

Do not merely stop posting new ratchet values. Existing Product runtime state may still contain old ratchet values.

When expression/ratchet sublane is turned off:

```text
clear ratchet step values in Product runtime
clear ratchet lane overrides if present
repost only enabled fields
```

Add a test that starts with ratchet values present, toggles expression off, then asserts runtime receives clear events and no ratchet events.

Success criterion:

- Old ratchet values cannot survive a sublane-off transition.

## Phase 6C — Fix C++ ratchet scheduling across audio blocks if still broken

Previous audit finding:

A common bug shape is:

```cpp
if (event_sample < block_start || event_sample >= block_end) continue;

for each ratchet subhit:
  ratchet_sample = event_sample + spacing * ratchet_index
  if ratchet_sample in current block: emit
```

This skips ratchet subhits that fall in later audio blocks because the parent step sample is no longer inside the later block.

Correct model:

```cpp
// When parent step fires, evaluate probability/trig condition once.
if (parentStepEntersThisBlock) {
  ParentHit hit = resolveParentHitOnce(lane, step);

  for (uint32_t i = 0; i < hit.ratchet_count; ++i) {
    PendingSequencerEvent e = hit.toEvent();
    e.absolute_sample = hit.parent_sample + round(hit.ratchet_spacing * i);
    e.ratchet_index = i;
    lane.pending_ratchets.push_back(e);
  }

  lane.emitted_hit_count += 1;
}

// Every block, drain pending ratchets.
drainPendingRatchets(block_start, block_end, out_events);
```

Success criterion:

- Ratchet 1, 2, 3, and 8 behave correctly across block boundaries.
- Probability/trig condition is evaluated once per parent step, not once per subhit unless explicitly designed otherwise.

---

# Phase 7 — Test harnesses to add

## Required npm scripts

Add these scripts or equivalent names in `package.json`:

```json
{
  "core:product:state-authority": "vitest run src/product-control/resolvePerformanceState.test.ts src/debug/productStateDebugHash.test.ts",
  "core:product:hot-swap-debug": "node scripts/check-kessho-product-running-preset-hot-swap-debug.mjs",
  "core:product:voice-revision-hot-swap": "node scripts/check-kessho-product-voice-revision-hot-swap.mjs",
  "core:product:ratchet-gating": "node scripts/check-kessho-product-ratchet-gating.mjs"
}
```

Use the repo’s actual test runner conventions if different.

---

## Harness 1 — ProductControl state authority

File:

```text
src/product-control/resolvePerformanceState.test.ts
```

Must test:

- morph keys empty still interpolates endpoint keys
- sequencer/edit affects product patch
- drum morph override affects product patch or does not advance revision
- endpoint replacement at midpoint recomputes resolved sliders
- endpoint edits persist at A/B
- preset load uses full-snapshot/source-rebuild apply mode
- sound-affecting actions cannot bump revision without changing resolved product patch

Success criterion:

- All tests pass.
- At least one test would have failed on the pre-fix ProductControl sidecar/no-op behavior.

---

## Harness 2 — Running Pad preset hot-swap debug

File:

```text
scripts/check-kessho-product-running-preset-hot-swap-debug.mjs
```

Use existing browser/runtime harness patterns in the repo.

Scenario:

```text
1. Start app or Product runtime harness.
2. Enable Product state debug.
3. Load Pad preset A.
4. Start Pad sequencer.
5. Wait for at least one voice spawn.
6. Load radically different Pad preset B while transport remains running.
7. Wait for the next Pad voice spawn.
8. Collect debug records.
```

Required assertions:

```text
ProductControl hash changed A -> B
encoded snapshot hash changed A -> B
Pad source snapshot hash changed A -> B
snapshot-applied ack received for B revision
C++ active Pad source hash changed A -> B
next Pad voice spawn hash equals B active source hash
transport did not stop/restart during the test
```

Success criterion:

- The harness fails if the app only hears preset B after stop/start.
- The harness fails if the next voice after B uses the old source hash.

---

## Harness 3 — Running Lead preset hot-swap debug

File:

```text
scripts/check-kessho-product-running-lead-preset-hot-swap-debug.mjs
```

Same as Pad, but:

```text
source: Lead
subsequence: off
transport: running
```

Required assertions:

```text
Lead ProductControl hash changed A -> B
Lead encoded source hash changed A -> B
snapshot-applied ack received
C++ active Lead source hash changed
next Lead voice spawn uses B source hash
subsequence remains off
transport does not restart
```

Success criterion:

- The Lead preset bug is reproduced and fixed without relying on stop/start.

---

## Harness 4 — Ratchet gating

File:

```text
scripts/check-kessho-product-ratchet-gating.mjs
```

Scenario:

```text
1. Create a sequence with active steps and ratchet values.
2. Confirm ratchet occurs when expression/ratchet sublane is on.
3. Turn expression sublane off.
4. Keep transport running.
5. Assert no ratchet subhits occur.
6. Turn expression sublane on.
7. Assert ratchet subhits return only if saved ratchet values are intended to restore.
```

Required assertions:

```text
expression off -> no ratchet step value events posted
expression off -> stale runtime ratchet values cleared
expression off -> C++ emitted sequencer events have ratchet_count <= 1
expression on -> behavior is explicit and tested
```

Success criterion:

- Ratchet cannot occur while expression/ratchet sublane is disabled.

---

## Harness 5 — Hot update parity with stop/start

File:

```text
scripts/check-kessho-product-hot-update-stop-start-parity.mjs
```

Scenario:

```text
1. Run preset A.
2. Hot-load preset B while running.
3. Capture next N newly triggered voice debug hashes and optionally audio graph tap.
4. Stop/start using preset B.
5. Capture next N newly triggered voice debug hashes and optionally audio graph tap.
6. Compare hashes and audio summary.
```

Required assertions:

```text
hot B voice source hash == stop/start B voice source hash
hot B compiled source hash == stop/start B compiled source hash
hot B output is not equal to A output
```

Audio graph comparison can be approximate. Debug hashes are mandatory.

Success criterion:

- Hot update and stop/start use the same Product Core source descriptor for newly spawned voices.

---

# Phase 8 — CPU and architecture cleanup after correctness

Only do this after phases 1–7 pass.

## Goal

Reduce CPU/message overhead without reintroducing stale state bugs.

## Apply policy classification

Replace “force full snapshot for everything” with explicit policies:

```text
Realtime param event:
  gain, pan, sends, post LPF, safe simple scalar params

Source rebuild:
  Pad/Lead preset identity
  Pad/Lead oscillator/body/filter/timbre core
  source override block
  compiled source descriptor changes
  envelope, unless proven safe live

Sequencer state event:
  lane enable/disable
  step values
  sublane enable/disable
  ratchet values

Full snapshot:
  graph topology
  asset table changes
  major source routing changes
  session restore
  fallback for unclassified trigger-critical changes
```

## Message coalescing rules

- While transport is running, coalesce fast slider drags to the latest value per audio block, not to a slow 33 ms batch that can miss triggers.
- Trigger-critical commits must flush before the trigger that depends on them.
- Preset load, morph endpoint replacement, source rebuild, and sequencer start must not be delayed by UI batching.

## C++ CPU rules

- Do not allocate memory on the audio thread during steady-state render.
- Preallocate pending event buffers for ratchets and sequencer subhits.
- Use fixed-size debug ring buffers only when debug is enabled.
- Compile source descriptors outside hot per-sample loops.
- Apply descriptor swaps at block boundaries.
- Keep FNV/debug hashing out of release builds or behind a debug flag.

## Success criterion

- Correctness harnesses still pass.
- Existing CPU product tests still pass.
- Hot slider movement while sequencer runs does not create unbounded worklet queue growth.
- Full snapshots are used only where required by current correctness policy.

---

# Required final verification checklist

The coding agent must include this exact checklist in its final report and fill it in with evidence.

```text
ProductControl invariants:
[ ] morph empty keys interpolate endpoint keys
[ ] sequencer/edit affects resolved product patch
[ ] drum morph override either affects resolved product patch or does not advance revision
[ ] endpoint replacement at midpoint recomputes resolved sliders immediately
[ ] endpoint edits at 0/100 persist after morph away/back
[ ] sound-affecting ProductControl action cannot bump revision without resolved output change

Runtime revision contract:
[ ] full-snapshot/source-rebuild commits include revision metadata
[ ] worklet sends snapshot-applied ack with same revision/hash
[ ] trigger-critical commits wait for audio-thread ack
[ ] host receipts distinguish host-posted vs audio-thread-applied

Pad hot-swap:
[ ] ProductControl hash changes A -> B
[ ] encoded snapshot/source hash changes A -> B
[ ] worklet ack received for B revision
[ ] C++ active Pad source hash changes A -> B
[ ] next Pad voice uses B source hash while transport remains running
[ ] no stop/start required

Lead hot-swap:
[ ] ProductControl hash changes A -> B
[ ] encoded snapshot/source hash changes A -> B
[ ] worklet ack received for B revision
[ ] C++ active Lead source hash changes A -> B
[ ] next Lead voice uses B source hash while transport remains running
[ ] subsequence remains off
[ ] no stop/start required

Ratchet:
[ ] expression/ratchet sublane off clears stale ratchet values
[ ] expression/ratchet sublane off emits no ratchet subhits
[ ] ratchet scheduling works across audio block boundaries

Regression commands:
[ ] npm run type-check
[ ] npm run core:product:state-authority
[ ] npm run core:product:hot-swap-debug
[ ] npm run core:product:voice-revision-hot-swap
[ ] npm run core:product:ratchet-gating
[ ] npm run core:product:resolved-state
[ ] npm run core:product:web-host
[ ] npm run core:product:sequencer
[ ] npm run core:product:host-reconciliation
[ ] npm run core:product:dirty-diff
[ ] npm run core:product:browser-runtime
[ ] npm run migration:product-boundary
[ ] npm run migration:no-web-ts-bundle
[ ] npm run migration:docs
```

Do not mark complete until every applicable item is checked. If a command does not exist, add it or document the exact equivalent existing command.

---

# Coding agent prompt

Paste the following into the coding agent.

```text
You are working in the Kessho repository. Your goal is to fix the Product Core “sliders are truth” architecture bug.

Non-negotiable invariant:
Every sound-affecting trigger must use the exact same resolved parameter state that the visible sliders display. Preset load, synth slider changes, morph endpoint changes, morph position changes, sequencer/subsequencer changes, keyboard audition, chord audition, Pad/Lead sequencer triggers, drum triggers, and ratchets must all use the latest committed resolved state. The user must not need to stop and restart transport to hear a new Pad or Lead preset.

Current reported bugs:
1. Pad preset changes while sequencer is running do not fully change the sound. Post LPF changes, envelope may partially change, but most Pad parameters stay old until stop/start.
2. Lead preset changes while sequencer is running, even with subsequence off, do not change sound until stop/start.
3. Ratchets still happen when the expression subsequencer is off.

Do not touch web-ts except for reference/parity tests. Do not declare success based on type-checks, host revision increments, one snapshot load, or manual listening. You must add telemetry and tests proving that the next C++ voice spawned while transport is running uses the new source revision/hash.

Follow these phases exactly:

PHASE 1 — ProductControl invariant tests and fixes
- Add tests in src/product-control/resolvePerformanceState.test.ts.
- Test that morph keys defaulting to [] does not make morph a no-op. Empty morph keys must fall back to the union of endpoint slider keys, or keys must be undefined unless explicitly set.
- Test that sequencer/edit changes resolved.productPatch and resolved.sliders for visible sequencer fields.
- Test that drum morph override actions either change resolved.productPatch or do not advance revision.
- Test that replacing preset A/B while morph is in the middle immediately recomputes resolved sliders and productPatch.
- Test that edits at morph endpoint A/B are remembered after morphing away and back.
- Add a general invariant: any sound-affecting ProductControl action that increments revision must change resolved.productPatch, unless explicitly metadata-only.
- Fix ProductControl until these pass.

PHASE 2 — Debug hashes and revision telemetry
- Add deterministic FNV-1a hash helpers for JSON and ArrayBuffer.
- Add dev-only ProductControl resolved-state logs gated by localStorage key kesshoProductStateDebug=1.
- Log revision, reason, applyMode, sliderHash, productPatchHash, Pad relevant hash, Lead relevant hash.
- Add encoded Product snapshot debug logs in CoreProductSnapshotCoordinator. Log encodedSnapshotHash, byteLength, Pad/Lead source preset IDs, morph, ADSR, post LPF, override hashes, and sourceSnapshotHash.
- Add revision metadata to runtime.loadSnapshot(snapshot, metadata).
- Add AudioWorklet snapshot-applied acknowledgement with the same revision and encoded hash. Trigger-critical commits must not be considered audio-applied until ack arrives.
- Add C++ debug telemetry for active source state and voice spawn: source_id, preset_id, source_revision, trigger_revision, source_state_hash, compiled_source_hash, override_block_hash.

PHASE 3 — Branch based on telemetry
Run Pad hot-swap while sequencer is running and Lead hot-swap while sequencer is running.
- If ProductControl hash does not change A -> B, fix preset/UI/ProductControl path.
- If ProductControl hash changes but encoded snapshot/source hash does not, fix coreProductSnapshot/source builder.
- If encoded snapshot hash changes but worklet snapshot-applied ack does not arrive, fix runtime/worklet/WASM application.
- If worklet ack arrives but C++ active source hash does not change, fix KesshoProductSnapshot.cpp/source state assignment/source compilation/override application.
- If C++ active source hash changes but next voice spawn hash is old, fix source descriptor cache/voice spawn/sequencer trigger path.
- If next voice spawn hash changes but audio still sounds old, fix Pad/Lead renderer or DSP module parameter application.

PHASE 4 — Runtime revision contract
- Make full-snapshot/source-rebuild commits carry revision metadata.
- Worklet must apply snapshots at a deterministic block boundary or at the exact point where WASM accepts the snapshot, then ack.
- Host receipts must distinguish host-posted from audio-thread-applied.
- commitProductControlActionThenTrigger or equivalent must not trigger before a trigger-critical revision is audio-applied.

PHASE 5 — Product Core hot source rebuild
- Add/verify source revisions in C++.
- When Pad/Lead preset/body/override/source fields change, rebuild a source descriptor with revision, preset_id, source_state_hash, compiled_source_hash.
- Swap active source descriptors at audio block boundaries.
- Newly spawned voices after revision R must use source descriptor revision R.
- Existing voices may either keep old descriptors or be released/killed; document the policy. Newly spawned voices must never use stale descriptors.

PHASE 6 — Ratchet fixes
- Fix step-value sublane gating so ratchet is disabled when expression subsequencer is off, or add an explicit ratchet sublane and make expression-off semantics match the requested behavior.
- Clear stale runtime ratchet values when expression/ratchet sublane is disabled.
- Add tests proving expression/ratchet off emits no ratchet subhits.
- If ratchets are still broken across audio blocks, implement pending absolute-time ratchet subevents and drain them block by block.

PHASE 7 — Harnesses and success criteria
Add or update scripts/tests:
- core:product:state-authority
- core:product:hot-swap-debug
- core:product:voice-revision-hot-swap
- core:product:ratchet-gating

Required proof for Pad and Lead hot-swap:
- ProductControl hash changes A -> B.
- Encoded snapshot/source hash changes A -> B.
- Worklet snapshot-applied ack arrives for B revision/hash.
- C++ active source hash changes A -> B.
- Next C++ voice spawned while transport remains running uses B source hash/revision.
- No stop/start required.

Run and report:
- npm run type-check
- npm run core:product:state-authority
- npm run core:product:hot-swap-debug
- npm run core:product:voice-revision-hot-swap
- npm run core:product:ratchet-gating
- npm run core:product:resolved-state
- npm run core:product:web-host
- npm run core:product:sequencer
- npm run core:product:host-reconciliation
- npm run core:product:dirty-diff
- npm run core:product:browser-runtime
- npm run migration:product-boundary
- npm run migration:no-web-ts-bundle
- npm run migration:docs

If a listed command does not exist, add it or use the exact equivalent existing command and explain the substitution.

Do not mark this complete until the exact hot-swap and ratchet success criteria pass with telemetry evidence.
```

---

# Expected final agent report format

The agent must report in this format:

```text
Summary:
- What was fixed.
- Which branch of telemetry identified the root cause.
- Whether the root cause was ProductControl, snapshot builder, runtime/worklet ordering, C++ source hot-rebuild, voice spawn cache, renderer/DSP, ratchet gating, or multiple.

Files changed:
- path: short reason

Telemetry proof:
Pad hot-swap:
- A ProductControl hash:
- B ProductControl hash:
- A encoded/source hash:
- B encoded/source hash:
- B snapshot-applied revision/hash:
- B C++ active source hash:
- next B voice source hash:
- transport restarted? yes/no

Lead hot-swap:
- A ProductControl hash:
- B ProductControl hash:
- A encoded/source hash:
- B encoded/source hash:
- B snapshot-applied revision/hash:
- B C++ active source hash:
- next B voice source hash:
- subsequence off? yes/no
- transport restarted? yes/no

Ratchet proof:
- expression/ratchet off clear event observed? yes/no
- emitted ratchet subhits while off:
- emitted ratchet subhits while on:

Tests run:
- command: pass/fail

Known limitations:
- Anything not completed.
- Any temporary full-snapshot fallback still used.
- Any CPU optimization intentionally deferred.
```
