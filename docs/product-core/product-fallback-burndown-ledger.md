# Product fallback burn-down ledger

## Scope

This ledger tracks temporary compatibility and fallback paths that can hide missing Product Core behavior, create feature bloat, or keep production code tied to migration-era shims.

Read-only reference code remains allowed under `src/audio/reference/**`, `src/audio/referenceAudioRuntime.ts`, `src/audio/ReferenceSelectedRuntime.ts`, `src/ui/referenceRuntime/**`, explicit dev runtime switchers, and tests until parity/A-B gates no longer need it.

## Inventory

| Area | File(s) | Current fallback/shim | Target fix | Status | Validation |
|---|---|---|---|---|---|
| Runtime selection | `ProductAudioRuntimeSelection.ts`, `ProductEngineProxy.ts`, `SelectedProductRuntime.ts` | legacy/reference/native/test modes reachable from product path | `ProductEngineProxy` core-only; reference selection isolated | pending | `npm run core:product:runtime-selection-isolation` |
| Deprecated audio engine alias | `ProductAudioEngineCompat.ts` | deprecated alias | delete or reference-only quarantine | pending | `npm run core:product:no-temporary-runtime-compat` |
| Product hooks | `src/ui/useProductRuntime*.ts` | product hooks delegate to selected-runtime hooks | product hooks call Product port/events/telemetry directly | pending | `npm run core:product:no-temporary-runtime-compat` |
| Host dispatch | `CoreProductHostInvoker.ts`, `CoreProductRuntimeHostPort.ts` | string-keyed host calls | typed host API or dev-only diagnostic harness | pending | `npm run core:product:web-host` |
| Snapshot patch fallback | `WebProductEngine.ts`, resolved-state service | full snapshot used for live changes | events/dirty-diff for live; full snapshot structural/load only | pending | `npm run test:product-snapshot-policy` |
| Visual sequencer fallback | `CoreProductHostSequencerVisuals.ts` | TS recomputes Product sequencer truth | Product telemetry authoritative; dev-only derived fallback | pending | `npm run core:product:sequencer-visual-lane-count` |
| Legacy preset repair | `presetUtils.ts`, stores | repair mixed into normal load | explicit `exact-as-saved`, `safe-audition`, `legacy-repair`, `session-restore` | pending | `npm run test:preset-exact-load` |
| Legacy drum aliases | runtime guards/import helpers | old voice aliases accepted outside legacy import | strict production voice resolver; legacy import/audition only | pending | `npm run core:product:legacy-boundary` |
| Unsupported surfaces | `CoreProductUnsupportedPolicy.ts` | retired unsupported list in runtime source | source contains live policy only; history in docs | pending | `npm run migration:no-unsupported-product-surface` |
| Preset V1/V2 fallback | `SupabasePresetStore.ts`, `presetStorageV2.ts` | legacy inline payload fallback | normal save/load V2 canonical; explicit legacy import/repair | pending | `npm run audit:preset-v2` |

## Rule

Every row must end as one of:

- `removed`
- `reference-only`
- `legacy-import-only`
- `allowed structural path`
- `explicit unsupported capability`
- `deferred with ticket and guard`

No row may end as vague `partial`, `temporary`, `fallback`, or `compat` without a ticket and guard.
