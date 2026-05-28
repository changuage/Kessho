# Kessho Fast Behavioral Product-Core Port Directive

Use this directive to redirect the current web-ts → product-core migration away from a slow 1:1 TypeScript/Web Audio port and toward a fast, behavior-preserving, C++-optimized product-core migration.

Recommended repo location:

```text
docs/product-core/fast-behavioral-port-directive.md
```

---

# Paste-ready coding-agent prompt

You are working in `https://github.com/changuage/Kessho` on the `web-ts` → `product-core` migration.

The migration direction has changed. Stop treating this as a 1:1 port of `web-ts`. The goal is a **behavioral product-core port**: the production app should behave like the old web-ts app from the user’s point of view, but the implementation should be optimized around C++ product-core, generated events, dirty diffs, snapshots, telemetry, stems, and platform-neutral product APIs. Do not preserve inefficient web-ts internals just because they existed.

There is only one coder on this tree. **A dirty tree is acceptable.** Do not stop because `git status` is dirty. Do not reset, stash, or revert unrelated work. Treat the current worktree as the source of truth, inspect it, and make corrective in-place changes as needed. It is fine to edit files already modified if doing so is necessary for correctness. Preserve unrelated WIP and explain any edits you make to existing dirty files.

## Immediate objective

Stop the slow over-validation loop. Make progress by batching small, correct, behavior-preserving migration slices and running focused gates. The next critical path is **runtime ownership closure**:

```text
Production app code -> ProductEnginePort / productEngine only
Product runtime adapter -> WebProductEngine / future NativeProductEngine
Product host internals -> coreProductEngineHost or product/host modules
Reference/dev harness only -> web-ts reference runtime
```

Do not broaden into DSP rewrites, sonic parity rewrites, schema/codegen expansion, or native bridge work unless the current slice actually touches those areas.

## Non-negotiable architecture rules

1. Production UI must import `ProductEnginePort` / `productEngine`, not `AudioEngine`.
2. `App.tsx` must stop directly importing `coreProductEngineHost`, `src/audio/runtime`, `src/audio/engine`, or the web-ts/reference runtime.
3. `web-ts` is reference/parity only. It must not be selectable as a production runtime.
4. `ProductEnginePort` must not expose `AudioNode`, `GainNode`, `AnalyserNode`, `MediaStream`, or browser-only Web Audio implementation objects.
5. `WebProductEngine` is a temporary adapter, not the permanent architecture. Compatibility behavior must have burn-down TODOs.
6. Common live controls should use generated `ProductEvent`s, explicit product patches, or dirty-diff paths. Do not force slider/sequencer/FX/transport changes through full snapshot reloads.
7. Full snapshots are allowed for initial load, preset load, session restore, deterministic fixtures, and schema/ABI validation. They are not the normal path for sliders, toggles, sequencer edits, transport, MIDI, journey macro moves, FX sends, or mute/solo.
8. Keep the C ABI stable and product-shaped. Prefer `kessho_product_enqueue_event`, `kessho_product_enqueue_events`, `kessho_product_load_snapshot_v2`, telemetry copy, asset registration, and stem buffer copy over adding one C function per UI action.
9. Do not mix behavior-changing DSP work with boundary refactors.
10. If missing behavior is exposed, record it as a product-core ticket or TODO. Do not reopen Web Audio node getters or production `web-ts` selection to hide missing coverage.

## Dirty-tree rules

Before coding:

```bash
git status --short
```

Then continue. Do **not** stop just because there are changes.

Use these rules:

```text
[allowed] edit already-dirty files when needed for correctness
[allowed] build on existing WIP if it is aligned with this directive
[allowed] replace brittle/incorrect partial work with correct boundary code
[allowed] add docs/scripts to redirect the migration
[forbidden] git reset --hard
[forbidden] git checkout -- .
[forbidden] stashing unrelated work without explicit instruction
[forbidden] reverting unknown user/agent work just to get a clean diff
[required] summarize which existing dirty files you changed and why
```

## First work batch

Implement or repair the current migration direction in this order:

1. Add this directive to the repo, preferably at `docs/product-core/fast-behavioral-port-directive.md`.
2. Add or update `MIGRATION_STATUS.md` with a short note: migration is now operating in **fast behavioral port mode**, not 1:1 web-ts port mode.
3. Inspect current runtime/import state:

```bash
rg "coreProductEngineHost|from ['\"].*audio/runtime|from ['\"].*audio/engine|AudioEngine|web-ts|core-smoke" src package.json scripts docs -g '*.{ts,tsx,js,mjs,json,md}'
rg "ProductEngineState\s*=\s*EngineState|AudioNode|GainNode|AnalyserNode|MediaStream|legacy-adapter-update|updateParams" src/audio/product src/App.tsx
```

4. Start with `App.tsx` and top-level runtime ownership only. Move runtime loading/lifecycle/selected-engine state behind product runtime provider/hooks or existing product runtime APIs.
5. Make `ProductEngineProxy` the production runtime decision point. Hide, reject, or dev-guard unimplemented `native-product`, `test-product`, `web-ts`, and `core-smoke` modes.
6. Keep `src/audio/runtime.ts` only as a deprecated legacy/reference facade if deleting it is too risky in the current slice.
7. Add/update `WebProductEngine` burn-down comments for temporary adapter behavior: `updateParams`, ignored patch reasons, `legacy-adapter-update`, `unregisterAsset`, unsupported methods.
8. Add/update semantic import guards. Prefer semantic boundary assertions over brittle exact string placement.

## Validation strategy

Stop running the full product prereq suite after every mechanical extraction.

### Always run after pure App/runtime ownership slices

```bash
npm run type-check
npm run migration:product-boundary
npm run core:product:architecture
```

### Also run when touching runtime/proxy/host/fallback selection

```bash
npm run core:product:runtime-fallbacks
npm run core:product:getter-policies
npm run core:product:web-host
```

### Also run when touching snapshots, patch routing, dirty diffs, events, sequencer/FX/transport controls

```bash
npm run core:product:dirty-diff
npm run core:product:patch-bridges
npm run core:product:snapshot-authority
```

### Run only after a batch of 2-4 related slices, not after every micro-change

```bash
npm run core:product:reference-isolation
npm run migration:docs
```

### Do not run these per-slice unless the slice actually touches C++/WASM/worklet/render/asset/telemetry cadence/DSP behavior

```bash
npm run core:product:ci:prereqs
npm run core:product:ci
npm run core:product:default-gate-v3
npm run core:product:browser-runtime
npm run core:product:cpu
npm run core:product:determinism
npm run core:product:graph
npm run core:product:fx
npm run core:product:fx-depth
npm run core:product:assets
npm run core:product:source-parity
npm run core:product:web-graph-parity:audit
npm run core:product:web-graph-capture-smoke:fast
npm run core:product:abi
npm run core:build:wasm
npm run core:product:wasm
```

### Full-audio trigger list

Escalate to browser runtime, CPU, C++/WASM, and sonic/parity gates only if the slice touches one of these:

```text
C++ product-core implementation
WASM bindings or ABI layout
AudioWorklet render path
render cadence or param smoothing cadence
worklet messaging protocol
asset decode/load/register/render behavior
stem/recording buffer movement
telemetry frequency or telemetry payload shape
DSP algorithms, FX, graph routing, source rendering, sequencer timing
```

## Optional npm script additions

Before adding these, check `package.json` and avoid duplicating existing scripts. Add only if useful:

```json
{
  "scripts": {
    "migration:fast-static": "npm run type-check && npm run migration:product-boundary && npm run core:product:architecture",
    "migration:runtime-static": "npm run migration:fast-static && npm run core:product:runtime-fallbacks && npm run core:product:getter-policies && npm run core:product:web-host",
    "migration:update-static": "npm run migration:runtime-static && npm run core:product:dirty-diff && npm run core:product:patch-bridges && npm run core:product:snapshot-authority",
    "migration:batch-check": "npm run migration:update-static && npm run core:product:reference-isolation && npm run migration:docs"
  }
}
```

If one of these scripts fails because the script name does not exist in this repo, do not blindly invent aliases. Inspect `package.json`, use the repo’s real gate names, and update this directive accordingly.

## Fast browser smoke target

If a browser smoke script already exists, use or adapt it. Do not run the long sonic browser runtime test after every mechanical slice.

The fast smoke should assert only:

```text
app loads
runtime resolves to core-product
start/stop or preload/start/suspend/resume works
no console/page/runtime errors
unsupportedControlCount === 0
unsupportedGetterCount === 0
runtimeFallbackDiagnosticCount === 0
audioCriticalFallbackCount === 0
web-ts/reference runtime was not loaded in production path
```

This is enough for App/host decomposition. Save RMS/peak/stem/string-arrangement sonic capture for full-audio checkpoints.

## Behavioral port policy

When old web-ts behavior has to be represented in product-core:

```text
Use product events for realtime-safe commands.
Use dirty diffs for small state changes.
Use full snapshots only for load/restore/preset/schema/fixture cases.
Use telemetry/stems/graph taps/recording bridge instead of raw Web Audio getters.
Use generated schema IDs/defaults/ranges where available.
Keep browser APIs below platform-specific runtime bridges.
Do not reproduce old Web Audio object topology in the public product interface.
```

### Examples

Bad migration target:

```ts
productEngine.getDynamicsAnalyser(): AnalyserNode
productEngine.getAllStemNodes(): Record<string, AudioNode>
productEngine.updateParams(fullSliderStateForEveryKnobMove)
```

Better migration target:

```ts
productEngine.getTelemetry()
productEngine.getSequencerUiState()
productEngine.enqueueEvent(createSetParamEvent(paramId, value))
productEngine.updateSnapshotPatch('ui-control-change', patch)
recordingBridge.listSources()
recordingBridge.startRecording(request)
```

## Current acceptance target

The current batch is successful when:

```text
[ ] App.tsx no longer directly imports coreProductEngineHost.
[ ] App.tsx no longer directly imports src/audio/runtime, src/audio/engine, or web-ts/reference runtime for production lifecycle/runtime selection.
[ ] Production app code reaches the engine through ProductEnginePort/productEngine.
[ ] web-ts is rejected, ignored, or moved behind dev/reference harness for production path.
[ ] native-product/test-product/core-smoke are not presented as available production runtime modes unless actually implemented.
[ ] ProductEnginePort exposes no raw Web Audio object types.
[ ] WebProductEngine compatibility behavior is explicitly marked temporary with burn-down TODOs.
[ ] Focused static/runtime gates pass for the files touched.
[ ] Full prereqs are deferred until the end of a 2-4 slice batch unless a full-audio trigger was touched.
```

## Report format after each batch

Return this summary:

```text
Changed files:
- ...

Existing dirty files modified:
- file: why it was safe/necessary

Behavior changes:
- none, or explicit list

Validation run:
- command: pass/fail

Validation intentionally skipped:
- command: reason based on slice classification

Remaining product-core tickets/TODOs:
- ...

Next recommended slice:
- ...
```

## Stop conditions

Stop and report if:

```text
A focused required gate fails and the fix is not local to this slice.
A change would require DSP/render behavior modification.
A missing product behavior requires a new event/schema/ABI decision.
A browser-only Web Audio object would need to leak into ProductEnginePort to continue.
```

Do not stop merely because the tree is dirty.
