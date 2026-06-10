# Kessho Restructure Audit — Post Texture / Sends / Trigger / Supabase Updates

_Date: 2026-06-09_

This audit is written for a low-reasoning coding agent. Follow the tasks in order. Do not creatively rename persisted state keys or rewrite architecture unless a task explicitly says to.

## Audit basis

Reviewed the live `changuage/Kessho` repository through GitHub web access, focusing on:

- `README.md` product runtime architecture and verification scripts.
- `src/App.tsx` routing, page, and DAW-output orchestration.
- `src/ui/dynamics/*`, `src/ui/global/RoutingMatrix.tsx`, `src/ui/sliderHelpCatalog.ts`.
- `src/ui/snowflakeV2/engineGroups.ts` and related Snowflake V2 helpers.
- `src/ui/useProductRuntimeManualTriggers.ts`, `src/ui/useProductRuntimeLiveTriggerCallbacks.ts`, `src/ui/useSelectedAudioEngineManualTriggers.ts`.
- `src/product-control/ProductControlActions.ts`, `src/product-control/commitResolvedState.ts`.
- `src/cloud/supabase.ts`, `src/cloud/supabaseEgressDiagnostics.ts`, `src/presets/SupabasePresetStore.ts`.
- `scripts/check-supabase-egress-guards.mjs`, `scripts/repair-supabase-preset-texture-v2.mjs`, CPU and routing scripts.

Local `git clone` was not available from the execution sandbox, so this is a repository-web audit rather than a local test run.

## Architectural guardrails

These guardrails come from the current repo design. Do not violate them while patching.

1. `core-product` is the production runtime. `web-ts` is reference-only.
2. Product UI must talk through `ProductEnginePort`, `WebProductEngine`, `coreProductEngineHost`, AudioWorklet/WASM, and the C ABI boundary.
3. Product-boundary APIs must not expose browser Web Audio objects.
4. Product code must not silently fall back to `web-ts`.
5. Do not add realtime heap allocations, unbounded object churn, or per-frame React work to audio-critical paths.
6. Do not use Supabase `.select('*')` or bare `.select()` on preset tables.
7. Do not mass-rename serialized `dynamics*` state keys until there is an explicit preset/schema migration. Use UI aliases for the Texture rename.

## Highest-risk findings

1. The Dynamics-to-Texture rename is incomplete. The UI still has `src/ui/dynamics`, `DynamicsPage`, `SliderPageId = 'dynamics'`, and trigger active tabs using `'dynamics'`. There is no obvious `src/ui/texture` entry point.
2. Routing definitions are duplicated across `App.tsx`, `RoutingMatrix.tsx`, `Snowflake V2`, DAW output routing, and help text. They are already inconsistent after the restructure.
3. `Snowflake V2` claims its engine groups match routing matrix rows, but the current group list omits Degrade/Reverb/Dynamics return rows and does not model Degrade sends.
4. `Snowflake V2` active-engine detection currently treats most enabled rows as active even when level is zero. This can cause incorrect arms, visuals, routing noise, and extra CPU work.
5. Product trigger hooks still delegate through selected-runtime compatibility hooks. The live trigger file explicitly says product-owned source/FX callbacks are still TODO.
6. Degrade/Reverb mutual exclusion logic lives inside `App.tsx`, which means preset load, morphing, repair scripts, and other state-entry paths can bypass or duplicate it.
7. Supabase egress fixes are mostly present, but the guard script only scans `src`, and the texture repair script does an unbounded active-row query before filtering.
8. CPU gates exist, but the scenario list does not explicitly exercise the new Texture/Degrade/Dynamics routing state, zero-level enabled sources, or trigger-burst control commits.

---

# Implementation plan

## P0. Create a single routing source registry

### Problem

Routing semantics are spread across multiple files:

- `src/App.tsx` has `ROUTING_SOURCE_SIMPLE_TOGGLES`, `ROUTING_SOURCE_DISABLE_ONLY_FAMILIES`, `activeDawOutputSourceIds`, route exclusion helpers, and many inline route sets.
- `src/ui/global/RoutingMatrix.tsx` has rows, columns, enable predicates, and Dynamics bus mapping.
- `src/ui/snowflakeV2/engineGroups.ts` has a separate engine list and send list.
- `src/audio/dawOutputRouting.ts` has its own source definitions.
- `src/ui/sliderHelpCatalog.ts` has user-facing routing descriptions.

This duplication is now causing drift.

### Files to add

Create:

- `src/ui/routing/routingSourceRegistry.ts`
- `src/ui/routing/routePredicates.ts`
- Optional barrel: `src/ui/routing/index.ts`

### Files to update

- `src/App.tsx`
- `src/ui/global/RoutingMatrix.tsx`
- `src/ui/snowflakeV2/engineGroups.ts`
- `src/audio/dawOutputRouting.ts`
- `src/ui/sliderHelpCatalog.ts`
- Any tests/scripts that hard-code routing row IDs.

### Required registry shape

Implement a central registry close to this shape. Adjust import names to match the actual codebase.

```ts
import type { SliderState } from '../state';

export const ROUTING_ACTIVE_EPSILON = 0.0001;

export type RoutingRowId =
  | 'pad1'
  | 'pad2'
  | 'lead1'
  | 'lead2'
  | 'piano'
  | 'drums'
  | 'granular'
  | 'waves'
  | 'water'
  | 'insects'
  | 'nature'
  | 'delayAOut'
  | 'delayBOut'
  | 'degrade'
  | 'reverb';

export type RoutingSendDestination =
  | 'delayA'
  | 'delayB'
  | 'granular'
  | 'degrade'
  | 'reverb'
  | 'dynamicsBus';

export type ToggleMode = 'simple-toggle' | 'disable-only-family' | 'return-row' | 'computed';

export interface RoutingSourceDef {
  id: RoutingRowId;
  label: string;
  levelKey: keyof SliderState;
  enabledKeys?: readonly (keyof SliderState)[];
  toggleMode: ToggleMode;
  sends: Partial<Record<RoutingSendDestination, keyof SliderState>>;
  dynamicsBusKey?: keyof SliderState;
  isEnabled(state: SliderState): boolean;
  isAudible(state: SliderState): boolean;
}

export function numericStateValue(state: SliderState, key: keyof SliderState): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function levelAboveEpsilon(state: SliderState, key: keyof SliderState): boolean {
  return numericStateValue(state, key) > ROUTING_ACTIVE_EPSILON;
}
```

### Predicate requirements

Use predicates that reflect families correctly:

- `pad1`: enabled when `pad1Enabled`, audible when enabled and `pad1Level > eps`.
- `pad2`: enabled when `pad2Enabled`, audible when enabled and `pad2Level > eps`.
- `lead1`: enabled when `lead1Enabled`, audible when enabled and `lead1Level > eps`.
- `lead2`: enabled when `lead2Enabled`, audible when enabled and `lead2Level > eps`.
- `piano`: enabled when `pianoEnabled`, audible when enabled and `pianoLevel > eps`.
- `drums`: enabled when `drumsEnabled`, audible when enabled and `drumsLevel > eps`.
- `granular`: enabled when `granularEnabled`, audible when enabled and `granularLevel > eps`.
- `waves`: enabled when `wavesEnabled`, audible when enabled and `wavesLevel > eps`.
- `water`: enabled when `waterEnabled`, audible when enabled and `waterLevel > eps`.
- `insects`: enabled when `insectsEnabled || insects2Enabled`, audible when enabled and `insectsSharedLevel > eps`.
- `nature`: enabled when `birdsEnabled || birds2Enabled || frogsEnabled`, audible when enabled and `natureLevel > eps`.
- `delayAOut`: enabled when `delayAEnabled`, audible when enabled and `delayALevel > eps`.
- `delayBOut`: enabled when `delayBEnabled`, audible when enabled and `delayBLevel > eps`.
- `degrade`: enabled when `degradeEnabled || driftEnabled || erosionEnabled || saturationEnabled`; audible when enabled and `degradeLevel > eps`.
- `reverb`: enabled when `reverbEnabled`; audible when enabled and `reverbLevel > eps`.

If the actual state key names differ, use the nearest existing keys. Keep the predicate intent.

### Send requirements

Each row should expose all sends it really supports:

- Delay A send key.
- Delay B send key.
- Granular send key.
- Degrade send key.
- Reverb send key.
- Dynamics bus key, where applicable.

Do not invent state keys. If a send does not exist for a row, omit it and add a comment explaining why.

### Acceptance checks

- `RoutingMatrix` rows are generated from the registry or from a thin adapter over the registry.
- `Snowflake V2` engine groups are generated from the same registry or explicitly validated against it.
- `App.tsx` no longer owns independent routing source lists.
- `activeDawOutputSourceIds` uses registry predicates.
- Help text uses registry labels or a shared list.
- Add a test that fails if registry rows and routing matrix rows diverge.

---

## P0. Fix Snowflake V2 active-engine logic and sends

### Problem

`src/ui/snowflakeV2/engineGroups.ts` says engine groups map 1:1 to routing matrix rows, but currently:

- It includes 13 arm-eligible rows, not the full current routing matrix set.
- `EngineSendKeys` covers Delay A, Delay B, Granular, and Reverb only.
- It does not model Degrade sends.
- It does not model Degrade/Reverb/Dynamics return rows as current routing concepts.
- `isEngineActive()` returns true for most rows when their enabled flag is true, even if level is zero.
- `nature` uses `birdsEnabled` only, so `birds2Enabled` or `frogsEnabled` alone can be missed.
- `insects` uses `insectsEnabled` only, so `insects2Enabled` alone can be missed.

### Files to update

- `src/ui/snowflakeV2/engineGroups.ts`
- Related Snowflake V2 tests, if present.

### Required changes

1. Add `degrade` to send typing.

```ts
export interface EngineSendKeys {
  delayA?: keyof SliderState;
  delayB?: keyof SliderState;
  granular?: keyof SliderState;
  degrade?: keyof SliderState;
  reverb?: keyof SliderState;
}
```

2. Replace enabled-key-only active logic with predicate plus level threshold.

```ts
function isEngineActive(engine: EngineGroupDef, state: SliderState): boolean {
  const enabled = engine.isEnabled
    ? engine.isEnabled(state)
    : engine.enabledKey
      ? Boolean(state[engine.enabledKey])
      : true;

  const level = Number(state[engine.levelKey] ?? 0);
  return enabled && Number.isFinite(level) && level > ACTIVE_LEVEL_EPSILON;
}
```

3. Add `isEnabled?: (state: SliderState) => boolean` to `EngineGroupDef`.

4. Use family predicates:

```ts
const insectsEnabled = (state: SliderState) =>
  Boolean(state.insectsEnabled) || Boolean(state.insects2Enabled);

const natureEnabled = (state: SliderState) =>
  Boolean(state.birdsEnabled) || Boolean(state.birds2Enabled) || Boolean(state.frogsEnabled);
```

5. Pull engine group data from the new routing registry where possible. Do not keep a hand-written parallel list unless there is a validation test.

6. Decide whether Degrade and Reverb return rows are arm-eligible in Snowflake V2.

Use one of these two explicit policies:

- **Policy A: return rows are arm-eligible.** Add `degrade` and `reverb` engine groups with level keys and sends.
- **Policy B: return rows are not arm-eligible.** Rename comments from “matches routing matrix rows exactly” to “matches source rows eligible for Snowflake arms,” and add a test that asserts the intentional subset.

7. If Dynamics/Texture is a terminal bus selector, do not add it as a send unless the UX actually needs it as an arm destination. Keep terminal bus semantics clear.

### Acceptance tests

Add tests for these cases:

- `pad1Enabled = true` and `pad1Level = 0` does not create an active engine.
- `insectsEnabled = false`, `insects2Enabled = true`, `insectsSharedLevel > 0` creates an active insects engine.
- `birdsEnabled = false`, `birds2Enabled = false`, `frogsEnabled = true`, `natureLevel > 0` creates an active nature engine.
- Degrade send keys are preserved when generating Snowflake groups.
- If return rows are arm-eligible, `degradeLevel > 0` and enabled flags produce a Degrade group.
- If return rows are intentionally excluded, a validation test documents that exclusion.

---

## P0. Finish the Dynamics-to-Texture UI rename safely

### Problem

The codebase still has user-facing and routing-facing `dynamics` page concepts. The user-facing restructure says Dynamics became Texture, but persisted state and database references still use `dynamics*` keys and `dynamicsBus` repair slots.

### Do not do

Do not globally rename all `dynamics*` state keys. That risks breaking presets and repair scripts.

### Required approach

Use aliasing:

- UI/page/tab name: `texture`.
- Internal persisted state keys: keep current `dynamics*` keys until a formal schema migration.
- Database repair/source compatibility: keep `dynamicsBus` slot names unless a DB migration is planned.
- User-facing labels: say “Texture”.
- Compatibility shims: accept legacy `dynamics` page IDs and route them to `texture`.

### Files to update

- `src/ui/dynamics/DynamicsPage.tsx` or new `src/ui/texture/TexturePage.tsx`
- `src/App.tsx`
- `src/ui/useProductRuntimeLiveTriggerCallbacks.ts`
- `src/ui/sliderHelpCatalog.ts`
- `src/ui/state.ts`, only if adding aliases/types, not mass-renaming serialized keys.
- Tests and route/page constants.

### Required changes

1. Create a Texture wrapper component.

Option A, lowest risk:

```ts
// src/ui/texture/TexturePage.tsx
export { default } from '../dynamics/DynamicsPage';
```

Then update user-facing imports to use `TexturePage` while leaving the old file intact.

Option B, moderate risk:

- Move `DynamicsPage.tsx` to `TexturePage.tsx`.
- Leave `src/ui/dynamics/DynamicsPage.tsx` as a compatibility re-export.

2. Add normalized page IDs.

```ts
export type CanonicalSliderPageId =
  | 'global'
  | 'earth'
  | 'granular'
  | 'reverb'
  | 'routing'
  | 'texture';

export type LegacySliderPageId = 'dynamics';
export type SliderPageId = CanonicalSliderPageId | LegacySliderPageId;

export function normalizeSliderPageId(page: SliderPageId): CanonicalSliderPageId {
  return page === 'dynamics' ? 'texture' : page;
}
```

3. Update active trigger tabs.

Replace active tab unions using `'dynamics'` with canonical `'texture'`, but allow legacy input if needed:

```ts
type ActiveTab = CanonicalSliderPageId | 'sequencer' | 'mixer' | 'preset' | 'snowflake';
```

4. Update user-facing copy:

- Page nav: “Texture”.
- Help catalog: “Texture”.
- Tooltips: “Texture”.
- Any route labels that expose “Dynamics” as a page should become “Texture”.

5. Keep internal labels clear:

Use comments like:

```ts
// Texture page currently controls persisted dynamics* keys for preset compatibility.
```

### Acceptance checks

- Searching user-facing UI files for `Dynamics` should only show compatibility comments or internal parameter labels that are intentionally unchanged.
- Existing presets with `dynamics*` keys still load.
- Legacy page ID `dynamics` routes to Texture.
- New page ID `texture` is used for live trigger active tab routing.
- No database repair scripts break because `dynamicsBus` remains supported.

---

## P0. Make product trigger hooks product-owned

### Problem

The product trigger architecture still delegates through selected-runtime compatibility hooks:

- `useProductRuntimeManualTriggers.ts` calls `useSelectedAudioEngineManualTriggers`.
- `useProductRuntimeLiveTriggerCallbacks.ts` explicitly says product-owned source/FX callbacks are TODO.

This is risky after the trigger architecture restructure because product-runtime trigger ordering, source metadata, and core-product constraints should not depend on the selected-runtime compatibility layer.

### Files to update

- `src/ui/useProductRuntimeManualTriggers.ts`
- `src/ui/useProductRuntimeLiveTriggerCallbacks.ts`
- `src/ui/useSelectedAudioEngineManualTriggers.ts`, only to remove duplicated product-specific logic if needed.
- `src/product-control/ProductControlActions.ts`
- `src/product-control/commitResolvedState.ts`, only if action metadata or reason handling needs expansion.
- Add a small audit script under `scripts/`, if practical.

### Required changes

1. Create a product-owned trigger controller.

Add:

- `src/ui/useProductRuntimeTriggerController.ts`

It should:

- Accept product runtime mode and product engine port.
- Commit pending product-control state before triggering.
- Call product engine trigger methods directly.
- Return stable callbacks.
- Never import `useSelectedAudioEngineManualTriggers` or `useSelectedAudioEngineLiveTriggerCallbacks`.

2. Keep commit-before-trigger ordering.

Use `commitProductControlActionThenTrigger` for manual note/drum triggers so slider/routing changes are committed before the trigger.

3. Expand manual trigger metadata.

Current action metadata is only `{ source }`. Expand it to distinguish trigger kinds:

```ts
export type ProductManualTriggerKind = 'synth-note' | 'drum-voice';

export interface ProductManualTriggerRequestAction {
  type: 'manual-trigger/request';
  source: ProductSourceId;
  kind: ProductManualTriggerKind;
  note?: ProductManualTriggerNote;
  voice?: ProductDrumVoiceId;
  velocity?: number;
}
```

If existing reducers expect the old shape, support both old and new shapes during transition.

4. Do not store non-deterministic timestamps in product control state. If trigger timing telemetry is needed, emit it outside reducer state.

5. Update live trigger active tabs to use canonical `texture`, with a legacy `dynamics` alias only at the boundary.

6. Add an audit script.

Create `scripts/check-product-trigger-ownership.mjs`:

- Fail if `src/ui/useProductRuntimeManualTriggers.ts` imports `useSelectedAudioEngineManualTriggers`.
- Fail if `src/ui/useProductRuntimeLiveTriggerCallbacks.ts` imports `useSelectedAudioEngineLiveTriggerCallbacks`.
- Fail if product trigger files import browser Web Audio types.

Add package script:

```json
"audit:product-triggers": "node scripts/check-product-trigger-ownership.mjs"
```

### Acceptance checks

- Product manual and live trigger hooks do not import selected-runtime hooks.
- Manual note trigger commits state before calling `productEngine.auditionSynthNote`.
- Drum trigger commits state before calling `productEngine.triggerDrumVoice`.
- Trigger callbacks are stable across renders unless dependencies actually change.
- `npm run type-check` passes.
- `npm run audit:product-triggers` passes.

---

## P1. Extract Degrade/Reverb route conflict policy from App

### Problem

`App.tsx` contains conflict logic for `degradeReverbSend` and `reverbDegradeSend`. That centralizes the behavior in the UI component, not in the routing/state layer. Other paths can bypass it:

- Preset load.
- Preset repair.
- Morph endpoint interpolation.
- Randomization.
- Snowflake assignments.
- Direct product control patches.

### Files to add

- `src/ui/routing/routeConflictPolicy.ts`

### Files to update

- `src/App.tsx`
- Preset load/normalize path.
- Morph/randomization path.
- Any repair or migration code that writes Degrade/Reverb sends.
- Tests.

### Required behavior

Implement one shared function:

```ts
export interface RouteConflictOptions {
  preserveActiveDirection?: 'degrade-to-reverb' | 'reverb-to-degrade' | 'largest' | 'last-edited';
  allowDualRange?: boolean;
}

export function normalizeDegradeReverbCrossfeed<T extends Partial<SliderState>>(
  patch: T,
  previousState?: SliderState,
  options: RouteConflictOptions = {},
): T {
  // Enforce exactly one active crossfeed direction unless allowDualRange is true.
  // Clear stale dual-range metadata when conflict is resolved.
  return patch;
}
```

Minimum policy:

- If both `degradeReverbSend` and `reverbDegradeSend` are positive, keep the one most recently edited if caller provides that info.
- If no last-edited info exists, keep the larger value.
- If values are equal and no last-edited info exists, prefer the direction already active in `previousState`.
- If still tied, prefer `degrade -> reverb` and document the tie-breaker.
- Clear dual-range metadata when a direction is disabled.

### Acceptance tests

- Setting `degradeReverbSend > 0` clears `reverbDegradeSend`.
- Setting `reverbDegradeSend > 0` clears `degradeReverbSend`.
- Loading a preset with both positive values normalizes deterministically.
- Morphing endpoints cannot produce both positive values unless explicitly allowed.
- Randomization cannot produce both positive values.
- `App.tsx` calls the shared policy instead of owning its own implementation.

---

## P1. Harden Supabase egress and preset repair paths

### Good current state

The repository already has important egress fixes:

- Cloud preset listing uses explicit summary selects.
- Detail fetches are separated from summary fetches.
- Egress diagnostics classify Supabase resources and trip byte thresholds.
- The guard script rejects `.select('*')` and bare `.select()` in `src`.
- V2 preset store uses explicit summary/detail/payload select constants.

### Remaining gaps

1. `scripts/check-supabase-egress-guards.mjs` scans `src` only. Repair and migration scripts can still regress egress behavior.
2. Texture repair loads full entries after compact queries, but the active-row fetch is unbounded.
3. Select constants are duplicated across cloud store, V2 store, and scripts.
4. There are not enough tests that prove list paths do not fetch heavy JSON payload columns.

### Files to update

- `scripts/check-supabase-egress-guards.mjs`
- `scripts/repair-supabase-preset-texture-v2.mjs`
- `src/cloud/supabase.ts`
- `src/presets/SupabasePresetStore.ts`
- New shared select module, if feasible.

### Required changes

1. Scan both `src` and `scripts`.

```js
const ROOTS_TO_SCAN = ['src', 'scripts'];
```

2. Add an allowlist for scripts that intentionally load payloads, but require them to:

- Use explicit select strings.
- Use `.limit(...)` or `.range(...)` for table scans.
- Default to `--dry-run` for repair scripts.
- Print estimated rows and selected columns before making changes.

3. Add a shared select constant module.

Suggested file:

- `src/cloud/presetSelects.ts`

It should export:

```ts
export const CLOUD_PRESET_SUMMARY_SELECT = 'id,name,author,description,created_at,plays,is_featured';
export const CLOUD_PRESET_DETAIL_SELECT = `${CLOUD_PRESET_SUMMARY_SELECT},data`;
export const PRESET_V2_SUMMARY_SELECT = '...';
export const PRESET_V2_ROW_SELECT = '...';
export const PRESET_V2_PAYLOAD_SELECT = '...';
```

Then import these constants instead of duplicating strings.

4. Page the texture repair script.

Add CLI flags:

- `--limit 500`
- `--offset 0`
- `--type state|source|leaf|all`
- `--scope user|factory|all`
- `--dry-run`, default true unless `--write` is passed.

Use `.range(offset, offset + limit - 1)` for active row fetches.

5. Pre-filter before full payload load.

Repair script should load full entry payload only after compact refs/metadata say the row might need repair.

6. Add mocked egress tests.

Tests should assert:

- List/search/featured paths never select `data`, `payload`, or `versions`.
- Explicit ID load may select detail/payload.
- Repair script scans are paged.
- Guard script fails on a synthetic `.select('*')` in `scripts`.

### Acceptance checks

- `npm run audit:supabase-egress` passes.
- `npm run audit:supabase-security` passes.
- `npm run audit:preset-v2:texture:postgres` passes.
- Repair script dry run prints selected columns and row range.
- No list/search path fetches preset payload JSON.

---

## P1. Add CPU scenarios for Texture, Degrade, routing sends, and triggers

### Problem

The current CPU budget tooling is useful, but the scenario list does not explicitly cover the new Texture/Degrade/Dynamics routing model or the trigger architecture changes.

### Files to update

- `scripts/check-kessho-product-cpu-scenarios.mjs`
- `scripts/check-kessho-product-cpu-budget.mjs`
- `scripts/check-kessho-product-module-cpu-report.mjs`
- `scripts/check-kessho-product-dirty-diff-classification.mjs`
- Product patch/dirty-diff code, if classifications are missing.

### Required scenarios

Add scenarios named approximately:

1. `texture-page-foreground`
   - Texture page active.
   - Texture visualizers enabled.
   - Product telemetry at foreground rate.
   - Several sources routed through Texture/Dynamics bus.

2. `degrade-routing-active`
   - Drift, erosion, saturation, and Degrade enabled.
   - Multiple source sends to Degrade.
   - Reverb send from Degrade enabled.

3. `degrade-reverb-conflict-normalize`
   - Attempt both `degradeReverbSend` and `reverbDegradeSend` positive.
   - Assert normalized state has only one direction active.
   - Verify no extra dirty modules are scheduled repeatedly.

4. `zero-level-enabled-sources`
   - Enable all source families.
   - Set most levels to zero.
   - Assert inactive modules do not consume material CPU and Snowflake arms ignore them.

5. `manual-trigger-burst-after-control-commit`
   - Rapid manual note/drum triggers.
   - Route changes committed immediately before triggers.
   - Assert no missed quantum spike beyond budget.

6. `preset-load-texture-repair-state`
   - Load a state resembling old Dynamics presets.
   - Normalize to Texture UI aliases.
   - Verify CPU does not spike from stale sends or duplicate routes.

### CPU optimization tasks

1. Inactive-source gating

Use registry `isAudible()` to avoid sending patches or running modules for inaudible sources, except when a bypass/flush event is needed.

2. Dirty-diff classification

Add or verify dirty classifications for:

- Degrade send changes.
- Reverb/Degrade crossfeed changes.
- Dynamics/Texture bus changes.
- Manual trigger actions.
- Snowflake arm assignment changes.

3. Coalesce high-rate UI changes

Use existing telemetry/rate-limit helpers. Avoid adding visual updates faster than the current foreground/background limits.

4. Per-module attribution

Update module CPU report to show at least:

- source DSP
- granular
- delay A
- delay B
- reverb
- degrade/texture
- dynamics/terminal bus
- graph/routing overhead

### Acceptance checks

- `npm run core:product:cpu` passes.
- `npm run core:product:cpu-scenarios` passes.
- `npm run core:product:module-cpu` includes Degrade/Texture/Dynamics attribution or an explicit “not separately measured” explanation.
- Zero-level enabled sources are not considered active by Snowflake V2.
- Manual trigger burst scenario does not repeatedly dirty unrelated modules.

---

## P1. Decide and document Degrade/Texture DAW-output taps

### Problem

DAW output routing currently includes a `dynamics` source/tap but no obvious `texture` or `degrade` stem, while the routing matrix has a Degrade row and Dynamics/Texture terminal bus concept.

This can be correct, but it must be explicit.

### Required decision

Choose one policy and implement consistently.

### Policy A: Texture is the renamed terminal bus; Degrade is internal

- Keep internal tap as `dynamicsOutput` for compatibility.
- Add UI alias label “Texture”.
- Do not add a separate Degrade DAW stem.
- Document that Degrade is part of the Texture processing path.
- Update DAW source labels so users do not see stale “Dynamics” unless it is a technical compatibility label.

### Policy B: Add separate Degrade and Texture stems

- Add graph tap IDs for Degrade output and Texture terminal output.
- Update product graph binding generation.
- Update `src/audio/dawOutputRouting.ts` definitions.
- Update active source predicates.
- Update tests and CPU module attribution.

### Acceptance checks

- `filterDawOutputRoutingConfigForSources()` has tests for active Texture/Degrade states.
- User-facing labels match chosen policy.
- Product graph tap IDs are generated, not hand-edited, if bindings are generated.
- `npm run core:product:graph` passes.

---

## P2. Reduce `App.tsx` routing and state orchestration debt

### Problem

`App.tsx` owns too many unrelated responsibilities:

- Page routing.
- Route matrix conflict normalization.
- Active DAW output source calculation.
- Toggle behavior.
- Morph asymmetry logic.
- Product runtime trigger wiring.
- Preset/load side effects.

This makes future restructures risky.

### Required extraction

Create hooks/modules:

- `src/ui/routing/useRoutingMatrixState.ts`
- `src/ui/routing/useDawOutputSources.ts`
- `src/ui/routing/useRouteConflictNormalization.ts`
- `src/ui/pages/pageAliases.ts`
- `src/ui/productRuntime/useProductRuntimeTriggers.ts` or use the product trigger controller from P0.

### Acceptance checks

- `App.tsx` imports routing helpers instead of declaring route source constants inline.
- No route matrix row IDs are declared in `App.tsx`.
- Tests for routing helpers can run without rendering the full app.

---

## P2. Add stale naming and registry consistency audits

### Add scripts

1. `scripts/check-texture-naming.mjs`

Rules:

- Fail on user-facing “Dynamics” in UI labels/help except allowlisted compatibility comments.
- Allow internal `dynamics*` state keys.
- Allow DB repair slots like `dynamicsBus` until migration.

2. `scripts/check-routing-registry-consistency.mjs`

Rules:

- Routing matrix rows must match registry rows or documented subset.
- Snowflake groups must match registry arm-eligible rows or documented subset.
- DAW output source IDs must have corresponding registry definitions or documented taps.
- Help catalog must not list destinations missing from registry.

3. `scripts/check-product-trigger-ownership.mjs`

Rules listed in P0 trigger section.

### Add package scripts

```json
"audit:texture-naming": "node scripts/check-texture-naming.mjs",
"audit:routing-registry": "node scripts/check-routing-registry-consistency.mjs",
"audit:product-triggers": "node scripts/check-product-trigger-ownership.mjs"
```

### Acceptance checks

- All three audits pass locally.
- `core:product:ci` or equivalent CI script includes them if project policy allows.

---

# Suggested patch order for the coding agent

Follow this exact order:

1. Add page alias helper and Texture wrapper, without deleting Dynamics files.
2. Add routing registry and predicates.
3. Update Snowflake V2 to use registry or validate against it.
4. Fix Snowflake active predicate and add Degrade send support.
5. Extract Degrade/Reverb conflict normalization.
6. Replace product trigger compatibility delegation with product-owned trigger hooks.
7. Harden Supabase egress guard and page repair script queries.
8. Add CPU scenarios for Texture/Degrade/trigger burst/zero-level enabled sources.
9. Add stale naming, routing registry, and trigger ownership audit scripts.
10. Run the verification command list below and fix failures.

# Verification command list

Run these after implementation. If one command does not exist in the current package file, skip it and note that it was unavailable.

```bash
npm run type-check
npm run audit:supabase-egress
npm run audit:supabase-security
npm run audit:preset-v2:texture:postgres
npm run audit:texture-naming
npm run audit:routing-registry
npm run audit:product-triggers
npm run core:product:sequencer-routing-smoke
npm run core:product:fx
npm run core:product:graph
npm run core:product:cpu
npm run core:product:cpu-scenarios
npm run core:product:module-cpu
npm run core:product:ci
```

# Definition of done

The restructure patch is done when all of these are true:

- Texture is the user-facing page name.
- Legacy `dynamics` page IDs still route safely.
- Persisted `dynamics*` state keys still load from old presets.
- Routing matrix, Snowflake V2, DAW output routing, and help text share one source of truth or have explicit validation tests for intentional subsets.
- Snowflake active engines require both enabled predicate and level above epsilon.
- Insects and nature families use all their family enabled keys.
- Degrade sends are represented wherever routing sends are represented.
- Degrade/Reverb crossfeed conflict normalization is shared and applied to App, preset load, morph/randomization, and repair paths.
- Product trigger hooks do not import selected-runtime compatibility hooks.
- Manual note/drum triggers commit product state before triggering.
- Supabase list/search paths do not fetch heavy JSON payload columns.
- Repair scripts are paged, dry-run by default, and use explicit selects.
- CPU scenarios exercise Texture, Degrade, route conflict normalization, zero-level enabled sources, and trigger bursts.
- Product boundary still does not expose Web Audio objects or fall back to `web-ts`.

---

# Goal code prompt for the coding agent

Use this prompt as the implementation instruction:

```text
You are editing the changuage/Kessho repository on the current main branch. Implement the post-restructure audit fixes without changing the Product Core architecture.

Primary goal:
Stabilize the Texture/Dynamics restructure, routing-sends restructure, product trigger architecture, Supabase preset egress fixes, and CPU budgets.

Hard constraints:
- core-product remains the production runtime.
- Do not silently fall back to web-ts.
- Do not expose browser Web Audio objects across the product boundary.
- Do not mass-rename persisted dynamics* state keys. Texture is the user-facing page alias; dynamics* keys remain for compatibility until a formal schema migration.
- Do not use Supabase .select('*') or bare .select().
- Do not add realtime allocations or high-rate React/render churn to audio-critical paths.

Implement in this order:
1. Add Texture page aliasing: create TexturePage wrapper or move DynamicsPage with a compatibility re-export. Add normalizeSliderPageId so legacy 'dynamics' maps to canonical 'texture'. Update user-facing labels/help/tabs to Texture while preserving dynamics* state keys.
2. Create a central routing registry with row IDs, labels, level keys, enabled predicates, audible predicates, sends including degrade, Dynamics/Texture bus keys, and toggle modes. Use it from App routing toggles, RoutingMatrix, Snowflake V2, DAW output source filtering, and help text where practical.
3. Fix Snowflake V2: add degrade send support; add isEnabled predicates; make active engines require enabled predicate AND level > epsilon; support insects2Enabled and birds2Enabled/frogsEnabled; either include Degrade/Reverb return rows or document/test their intentional exclusion.
4. Extract Degrade/Reverb crossfeed normalization into a shared routeConflictPolicy module. Apply it in App state updates, preset load normalization, morph/randomization, and repair/migration paths.
5. Replace product trigger hook delegation. useProductRuntimeManualTriggers and useProductRuntimeLiveTriggerCallbacks must not import selected-runtime compatibility hooks. Create product-owned stable callbacks that commit product control state before calling productEngine.auditionSynthNote or productEngine.triggerDrumVoice. Expand manual-trigger/request metadata to include kind/note/voice/velocity while preserving backward compatibility.
6. Harden Supabase egress: extend the egress guard to scan scripts as well as src; page texture repair script active-row queries with limit/range; keep dry-run default; share select constants if feasible; add tests/mocks proving list/search paths never fetch payload/data columns.
7. Add CPU scenarios for texture page foreground, degrade routing active, degrade-reverb conflict normalization, zero-level enabled sources, manual trigger burst after control commit, and preset load of old dynamics/texture state. Ensure dirty-diff classifications do not dirty unrelated modules.
8. Add audit scripts for texture naming, routing registry consistency, and product trigger ownership.

Run and fix:
npm run type-check
npm run audit:supabase-egress
npm run audit:supabase-security
npm run audit:preset-v2:texture:postgres
npm run audit:texture-naming
npm run audit:routing-registry
npm run audit:product-triggers
npm run core:product:sequencer-routing-smoke
npm run core:product:fx
npm run core:product:graph
npm run core:product:cpu
npm run core:product:cpu-scenarios
npm run core:product:module-cpu
npm run core:product:ci

Deliver a concise summary listing changed files, tests run, and any intentionally deferred migration work.
```
