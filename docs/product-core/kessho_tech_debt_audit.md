# Kessho Tech Debt Audit

**Scope:** Product Core host, reference/web-ts runtime, app UI/state, and C++ Product event dispatch.  
**Policy update:** Do **not** retire, delete, or disable anything required to run `web-ts`, `product-test`, A/B comparison, parity testing, or reference playback. Those paths should be fenced and labeled as **Archive Later**, not removed now.

This audit is based on a review of the public repository structure and source files. It is an architecture/static review, not a local build or runtime verification.

---

## Status Labels Used in This Audit

| Label | Meaning |
|---|---|
| **Keep Active** | Required for production, `web-ts`, `product-test`, A/B testing, parity testing, or diagnostics. Do not remove. |
| **Archive Later** | Legacy/reference code that should remain functional now but should be marked as a future archival candidate once Product Core fully replaces the need. |
| **Collapse Now** | Thin forwarding, duplicate indirection, or alias code that can be removed if tests confirm it is not part of `web-ts`/A/B/product-test. |
| **Refactor** | Keep behavior, but reduce duplication, centralize ownership, or make code schema/table-driven. |
| **Generate/Table-Drive** | Replace hand-maintained switch/dispatch/schema duplication with generated metadata or declarative tables. |

---

## Executive Finding

The main issue is **not simply large files**. The larger issue is that the app has several mirrored runtime surfaces:

```txt
Product UI / App state
  -> ProductEnginePort / WebProductEngine
  -> CoreProductRuntimeHostPort
  -> Product host bridge helpers
  -> coreProductEngineHost
  -> WASM / C++ Product Core
```

In parallel, the repository still has reference and parity paths:

```txt
web-ts reference runtime
core-smoke / coreEngineHost reference path
product-test / A-B comparison paths
```

Those reference paths are currently valuable for A/B testing and should **not** be retired yet. The cleanup target should be:

1. Keep `web-ts` and parity paths working.
2. Fence them clearly as **reference/A-B/Archive Later**.
3. Prevent production code from drifting back into those paths accidentally.
4. Collapse pure Product-host pass-through layers where they are not needed for A/B or product-test.
5. Replace duplicated UI/state/control/event metadata with schema-driven or table-driven systems.

---

## Do Not Retire Now

The following should remain functional because they may support `web-ts`, `product-test`, A/B comparison, parity checks, smoke tests, or reference playback.

| Area | Current Recommendation | Notes |
|---|---:|---|
| `src/audio/reference/webTs/engine.ts` | **Keep Active / Archive Later** | Large, but it is the reference runtime needed for A/B testing. Do not delete or degrade. |
| `src/audio/coreEngineHost.ts` | **Keep Active if product-test/core-smoke depends on it / Archive Later** | Do not spend major production refactor effort here, but keep it working while reference/parity tests need it. |
| `src/audio/referenceAudioRuntime.ts` | **Keep Active** | Runtime selector for explicit reference/dev paths. Keep clear gates around it. |
| `core-smoke` paths | **Keep Active / Archive Later** | Keep until Product Core parity coverage fully replaces them. |
| `web-ts` compatibility shims used by tests | **Keep Active / Archive Later** | Mark with comments and owner, but do not remove while A/B testing depends on them. |
| Boundary/check scripts that protect production from reference imports | **Keep Active** | These are useful as long as reference and production runtimes coexist. |

### Required comment convention

Add a consistent header to reference-only or A/B-only files:

```ts
/**
 * REFERENCE / A-B TESTING PATH
 *
 * This file is required for web-ts, product-test, parity checks, or A/B comparison.
 * Do not delete or simplify in a way that changes behavior unless the corresponding
 * Product Core replacement and A/B validation have landed.
 *
 * Status: Archive Later
 */
```

For C++ files or scripts, use the same wording in the local comment style.

---

## Priority 1: Collapse Pure Product Host Forwarding Layers

**Status:** Collapse Now, with test verification.  
**Do not touch anything required by `web-ts` A/B testing.**

The clearest duplication is the Product host adapter chain:

```txt
WebProductEngine
  -> CoreProductRuntimeHostPort
  -> CoreProductRuntime*PortBridge helpers
  -> coreProductEngineHost
```

The bridge files appear to mirror method names and forward calls. This creates multiple API surfaces that need to remain aligned.

### Candidate files

- `src/audio/product/WebProductEngine.ts`
- `src/audio/product/host/CoreProductRuntimeHostPort.ts`
- `src/audio/product/host/CoreProductRuntimeReadPortBridge.ts`
- `src/audio/product/host/CoreProductRuntimeCommandPortBridge.ts`
- `src/audio/product/host/CoreProductRuntimeTelemetryPortBridge.ts`

### Keep if they provide real behavior

Keep bridge modules if they do any of the following:

- validate Product events;
- translate between stable Product API and unstable host internals;
- batch runtime calls;
- normalize diagnostics;
- protect A/B testing paths;
- support product-test fixtures;
- preserve backwards compatibility during migration.

### Remove or merge if they only do this

```ts
export function setOutputGain(callHost, value) {
  return callHost('setOutputGain', value);
}
```

Pure alias wrappers add bloat without adding ownership.

### Better target shape

Preferred:

```txt
WebProductEngine
  -> ProductRuntimePort
  -> coreProductEngineHost
```

or, longer term:

```txt
ProductEnginePort
  -> generated Product runtime API
  -> coreProductEngineHost / WASM bridge
```

### Acceptance checks

Before deleting any bridge method:

- run the existing Product Core tests;
- run `product-test` / A-B tests that exercise `web-ts` comparison;
- verify no reference runtime import was silently changed;
- verify production still resolves through the Product Core path;
- verify `web-ts` can still be selected explicitly for comparison.

---

## Priority 2: Box `coreEngineHost.ts`, Do Not Production-Refactor It

**Status:** Keep Active if parity/product-test needs it; Archive Later.

`src/audio/coreEngineHost.ts` is still very large, but it appears to be a legacy/reference host rather than the main Product Core production host. The right move is not to split it for aesthetics.

### Recommended treatment

1. Add an **Archive Later** header.
2. Keep it functional for `core-smoke`, parity, A/B, or product-test usage.
3. Prevent new production dependencies on it.
4. Avoid performance optimization unless a reference/product-test path is too slow or unstable.
5. Do not split it unless the split removes actual duplication or isolates test-only behavior.

### Why not split it now?

Splitting a legacy/reference host into many smaller legacy/reference files may make the tree look cleaner while preserving the real debt. The higher-value work is to:

- keep it boxed;
- keep tests passing;
- migrate Product Core behavior elsewhere;
- archive later when A/B no longer needs it.

### Suggested header

```ts
/**
 * REFERENCE HOST / ARCHIVE LATER
 *
 * This file is not the preferred Product Core production host.
 * It remains active for core-smoke, web-ts comparison, product-test,
 * parity validation, or other A/B workflows.
 *
 * Do not add new production dependencies here.
 * Do not delete while reference/A-B tests depend on it.
 */
```

---

## Priority 3: Shrink `coreProductEngineHost.ts` by Removing Responsibilities, Not Just Lines

**Status:** Refactor.

`src/audio/coreProductEngineHost.ts` has already been split down substantially. The remaining debt is about ownership, not file length.

### Current concern

The host still appears to combine several roles:

- runtime state and callback wiring;
- Product Core method calls;
- sequencer override caches;
- telemetry/diagnostic callbacks;
- graph/debug snapshots;
- parity/debug helpers;
- compatibility patch application.

### What to isolate

#### 1. Debug/parity graph helpers

Move methods such as `getSonicParityDebugState()` and graph-capture helpers behind a debug/parity extension.

Do **not** delete them if product-test or A/B comparison uses them. Instead:

```txt
coreProductEngineHost
  production host methods only

productHostDebugExtensions
  parity snapshots
  graph probes
  smoke-test helpers
  A/B comparison probes
  Status: Archive Later if superseded
```

#### 2. Sequencer override duplication

If the host stores parallel synth/drum versions of the same structures, collapse them into a keyed cache:

```ts
type SequencerKind = 'synth' | 'drum';

interface SequencerHostCache {
  stepToggleOverrides: unknown;
  stepValueOverrides: unknown;
  stepValueConfigs: unknown;
  subLaneEnabled: unknown;
  pitchSettings?: unknown;
}

const sequencerCache: Record<SequencerKind, SequencerHostCache> = {
  synth: createSequencerHostCache(),
  drum: createSequencerHostCache(),
};
```

This keeps behavior but removes duplicated code paths.

#### 3. Fixed lane/source constants

Where possible, replace local hard-coded lane/source counts with generated Product metadata.

Do not do this if it changes reference comparison semantics. If web-ts A/B expects legacy lane behavior, preserve that behavior behind an explicit compatibility flag.

---

## Priority 4: Reduce `App.tsx` and `src/ui/state.ts` Duplication

**Status:** Refactor.

`src/App.tsx` and `src/ui/state.ts` look like major production bloat areas. This is likely where UI control metadata, runtime patch keys, defaults, serialization behavior, and slider settings are duplicated.

### Target problem

Avoid repeating this information in multiple places:

- label;
- min/max;
- default value;
- step size;
- formatter;
- runtime patch key;
- Product param ID;
- morph behavior;
- serialization behavior;
- reset behavior;
- A/B comparison behavior.

### Better target shape

```txt
src/ui/controls/productControlSchema.ts
  Product-backed control metadata

src/ui/controls/uiOnlyControlSchema.ts
  UI-only metadata

src/ui/controls/ControlRenderer.tsx
  Slider / toggle / select renderer

src/App.tsx
  Composition only
```

### Example schema pattern

```ts
interface ControlDefinition<TValue> {
  key: string;
  label: string;
  defaultValue: TValue;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: TValue) => string;
  productParamId?: number;
  serialize?: boolean;
  morphable?: boolean;
  abComparable?: boolean;
}
```

### Important A/B rule

If a UI control exists only because `web-ts` exposes or needs it for comparison, do not delete it. Mark it:

```ts
abComparable: true,
status: 'archive-later',
```

or document it in a nearby comment.

### Good first extraction

Start with one panel or one control family rather than trying to rewrite all of `App.tsx` at once:

```txt
App.tsx
  -> ProductRuntimeProvider
  -> TransportControls
  -> SourcePanels
  -> SequencerPanel
  -> MorphPanel
  -> DiagnosticsPanel
  -> VisualizerHost
```

The goal is not merely smaller files. The goal is fewer duplicate handlers and fewer manually repeated control definitions.

---

## Priority 5: Make `KesshoProductEvents.cpp` Table-Driven or Generated

**Status:** Generate/Table-Drive.

`cpp/KesshoCore/src/product/KesshoProductEvents.cpp` is still fairly large. That is not automatically bad for a central event file, but it becomes debt if it contains hand-expanded validation and dispatch tables that mirror data already known elsewhere.

### Do not just split it

Avoid splitting by arbitrary chunks such as:

```txt
KesshoProductEventsPart1.cpp
KesshoProductEventsPart2.cpp
KesshoProductEventsPart3.cpp
```

That preserves the same manual dispatch debt.

### Better target

Move toward a generated or table-driven structure:

```cpp
struct ProductEventSpec {
  uint32_t kind;
  ProductEventValidation validation;
  ProductEventHandler handler;
};
```

Then central dispatch becomes:

```cpp
const ProductEventSpec* spec = findProductEventSpec(event.kind);
if (!spec) {
  return KESSHO_PRODUCT_EVENT_ERROR_UNKNOWN_KIND;
}

if (!validateProductEvent(*spec, event)) {
  return KESSHO_PRODUCT_EVENT_ERROR_INVALID_PAYLOAD;
}

return spec->handler(context, event);
```

### Best candidates for generation

- event kind validation;
- param ID to destination mapping;
- min/max/clamp rules;
- bool/int/float type handling;
- source/lane/target bounds;
- telemetry error code mapping;
- granular/dynamics/source parameter dispatch.

### A/B rule

If `web-ts` comparison depends on exact legacy event behavior, preserve that behavior until the Product Core path proves parity. Mark such behavior:

```cpp
// A/B COMPAT: Preserve legacy web-ts comparison behavior.
// Status: Archive Later after Product Core parity validation.
```

---

## Priority 6: Keep `web-ts` Compatibility Imports, But Track Them Explicitly

**Status:** Keep Active / Archive Later.

The reference isolation rules already distinguish production Product Core code from temporary reference compatibility. Keep this separation, but make it more explicit.

### Recommended tracking format

Create or maintain a small burn-down document:

```md
# web-ts / A-B Compatibility Burn-Down

| Import or Shim | Used By | Why Needed | Product-Native Replacement | Archive Condition | Owner |
|---|---|---|---|---|---|
| `exampleLegacyModule` | product-test A/B | compares legacy behavior | Product Core event X | parity test passes | TBD |
```

### Rules

- Do not remove compatibility imports used by `web-ts` A/B testing.
- Do not allow production Product Core code to add new accidental `web-ts` dependencies.
- Every compatibility exception should have a reason and archive condition.
- Once a Product-native replacement passes A/B, move the compatibility entry to archived.

---

## Priority 7: Update Stale Documentation Without Removing Reference Support

**Status:** Refactor docs.

The documentation should make it clear that Product Core is the production path while `web-ts` remains supported for A/B/product-test.

### Replace old guidance with this

```txt
Engine Integration

Production runtime:
  ProductEnginePort
  WebProductEngine
  coreProductEngineHost
  AudioWorklet/WASM Product Core

Reference / A-B runtime:
  src/audio/reference/webTs/engine.ts
  src/audio/referenceAudioRuntime.ts
  core-smoke / parity paths as needed

Rules:
  - Do not add new production dependencies on web-ts.
  - Do not delete web-ts while product-test or A/B comparison needs it.
  - Mark reference-only paths as Archive Later.
  - Keep production and reference imports visibly separated.
```

### Add a repository-wide convention

Use status headers:

```txt
Status: Production
Status: Reference / A-B / Keep Active
Status: Archive Later
Status: Test Only
Status: Temporary Product Compatibility
```

This prevents future contributors from mistaking reference code for dead code.

---

## Priority 8: Reduce Script Bloat Later, Not First

**Status:** Keep Active now; Refactor later.

Boundary scripts are useful while production and reference paths coexist. They should not be deleted simply because they are large.

### Keep now

- production/reference boundary checks;
- no accidental `web-ts` production import checks;
- core-smoke/product-test checks;
- reference isolation checks.

### Refactor later

Once the runtime boundary stabilizes:

- extract shared file-scanning utilities;
- replace brittle string checks with higher-level contract checks where possible;
- remove checks that only preserve retired migration behavior;
- keep checks that prevent production from importing reference runtime code.

---

## Suggested PR Sequence

### PR 0: Add status labels and archive-later headers

Add headers to reference/A-B files before deleting anything.

**Goal:** make it impossible to confuse `web-ts` support with dead code.

Files likely involved:

- `src/audio/reference/webTs/engine.ts`
- `src/audio/coreEngineHost.ts`
- `src/audio/referenceAudioRuntime.ts`
- product-test support files
- compatibility shims
- relevant boundary scripts

---

### PR 1: Document the A/B runtime contract

Add a short doc such as:

```txt
docs/runtime-boundaries.md
```

Include:

- Product Core production path;
- `web-ts` A/B path;
- `core-smoke` path;
- what is allowed to import what;
- what is Archive Later;
- what must not be removed.

---

### PR 2: Collapse Product-only no-op bridges

Target only bridge methods that are pure pass-throughs and not used by `web-ts` or product-test.

Before merging:

- run Product Core tests;
- run product-test / A-B comparison;
- run production bundle boundary checks;
- verify explicit `web-ts` selection still works.

---

### PR 3: Move Product host debug/parity helpers behind a debug extension

Do not delete debug behavior. Move it into a clearly named module:

```txt
src/audio/product/host/ProductHostDebugBridge.ts
```

or similar.

Mark it:

```txt
Status: Reference / A-B / Archive Later
```

---

### PR 4: Unify synth/drum sequencer host caches

Replace parallel synth/drum structures with a keyed cache by sequencer kind.

Keep all output behavior identical.

---

### PR 5: Start schema-driving UI controls

Choose one panel or control family and replace repeated control metadata with a schema.

Do not remove controls needed for `web-ts` A/B comparison. Mark those controls as `abComparable` or `Archive Later`.

---

### PR 6: Table-drive one C++ event subsystem

Pick one subsystem in `KesshoProductEvents.cpp`, such as granular, dynamics, source, or transport events.

Convert only that subsystem first to prove the pattern.

---

## Immediate Do / Do Not List

### Do

- Keep `web-ts` working for A/B and product-test.
- Add **Archive Later** labels to reference code.
- Collapse Product-only no-op forwarding layers.
- Move debug/parity helpers out of the production host surface when possible.
- Centralize duplicated UI control metadata.
- Move C++ event dispatch toward generated/table-driven specs.
- Keep boundary checks that prevent accidental production imports from reference runtime code.

### Do not

- Do not delete `src/audio/reference/webTs/engine.ts`.
- Do not delete `src/audio/coreEngineHost.ts` while product-test, core-smoke, or parity checks depend on it.
- Do not remove compatibility imports needed for A/B comparison.
- Do not split large files only to make line counts smaller.
- Do not optimize reference code unless A/B/product-test performance requires it.
- Do not allow production code to silently fall back to `web-ts`.
- Do not replace legacy behavior with Product Core behavior without parity validation.

---

## Bottom Line

Treat `web-ts` and the old reference hosts as **active A/B infrastructure**, not dead code. The right move is:

```txt
Keep active now.
Fence clearly.
Prevent new production coupling.
Mark as Archive Later.
Delete only after Product Core parity is proven and A/B no longer needs it.
```

The highest-value tech debt cleanup remains the same: remove duplicated runtime surfaces, schema-drive repeated UI/control metadata, and make C++ Product event dispatch generated or table-driven. But all cleanup should preserve the `web-ts` A/B path until it is intentionally archived.

---

## Source Paths Referenced

- [`src/audio/coreProductEngineHost.ts`](https://github.com/changuage/Kessho/blob/main/src/audio/coreProductEngineHost.ts)
- [`src/audio/coreEngineHost.ts`](https://github.com/changuage/Kessho/blob/main/src/audio/coreEngineHost.ts)
- [`src/audio/reference/webTs/engine.ts`](https://github.com/changuage/Kessho/blob/main/src/audio/reference/webTs/engine.ts)
- [`src/audio/product/WebProductEngine.ts`](https://github.com/changuage/Kessho/blob/main/src/audio/product/WebProductEngine.ts)
- [`src/audio/product/host/CoreProductRuntimeHostPort.ts`](https://github.com/changuage/Kessho/blob/main/src/audio/product/host/CoreProductRuntimeHostPort.ts)
- [`cpp/KesshoCore/src/product/KesshoProductEvents.cpp`](https://github.com/changuage/Kessho/blob/main/cpp/KesshoCore/src/product/KesshoProductEvents.cpp)
- [`src/App.tsx`](https://github.com/changuage/Kessho/blob/main/src/App.tsx)
- [`src/ui/state.ts`](https://github.com/changuage/Kessho/blob/main/src/ui/state.ts)
- [`scripts/check-no-web-ts-production-bundle.mjs`](https://github.com/changuage/Kessho/blob/main/scripts/check-no-web-ts-production-bundle.mjs)
- [`scripts/check-kessho-product-reference-isolation.mjs`](https://github.com/changuage/Kessho/blob/main/scripts/check-kessho-product-reference-isolation.mjs)
- [`scripts/check-core-engine-host.mjs`](https://github.com/changuage/Kessho/blob/main/scripts/check-core-engine-host.mjs)
