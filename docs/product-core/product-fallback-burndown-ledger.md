# Product fallback burn-down ledger

This ledger records the runtime paths that could hide missing Product Core
behavior. The current Product path is fail-fast and the Web TS implementation
is reference-only.

| Area | Current owner | Classification | Evidence |
|---|---|---|---|
| Runtime selection | `src/ui/productRuntimeConstruction.ts` and `src/audio/product/ProductEngineProxy.ts` | Product Core is the production engine; development selection constructs one typed reference adapter and selected capability facets | `npm run core:product:runtime-selection-isolation`, `npm run migration:product-boundary` |
| Retired selected-runtime wrappers | `src/ui/useSelectedAudioEngine*`, `src/audio/product/SelectedProductRuntime.ts` | Removed from the active tree | `rg -n "useSelectedAudioEngine|SelectedProductRuntime" src/App.tsx src/ui src/audio/product` |
| Reference runtime | `src/audio/reference/**`, `src/audio/referenceAudioRuntime.ts`, `src/ui/referenceRuntime/**` | Reference-only development/parity implementation; never a Product fallback | `npm run migration:no-web-ts-bundle`, `npm run core:product:reference-isolation` |
| Product hooks | `src/ui/useProductRuntime*.ts` | Product hooks consume Product port/capability surfaces; state and telemetry selection is completed at construction | `npm run migration:product-boundary` |
| Host dispatch | `src/audio/product/host/CoreProductHostInvoker.ts` and `CoreProductRuntimeHostPort.ts` | Allowed structural host boundary; method names are validated at the Product host edge | `npm run core:product:web-host` |
| Snapshot patch policy | `src/audio/product/WebProductEngine.ts` and Product control services | Live edits use classified events/dirty diffs; full snapshots are reserved for structural or load paths | `npm run test:product-snapshot-policy`, `npm run core:product:dirty-diff` |
| Sequencer visuals | `src/audio/product/host/CoreProductSequencerVisualBridge.ts` and `CoreProductHostSequencerVisuals.ts` | Product telemetry is authoritative; missing sample-rate telemetry prevents step projection instead of guessing | `npm run core:product:sequencer-ui`, `npm run core:product:sequencer-visual-lane-count` |
| Preset loading | `src/presets/currentPresetSchema.ts`, `fileIO.ts`, `PresetStore.ts` | Current canonical entries only; malformed/legacy entries fail explicitly | `npm run test:preset-current-schema`, `npm run test:preset-exact-load`, `npm run test:preset-dedup` |
| One-time migration tooling | `src/presets/presetV2Migration.ts`, `src/ui/state.ts:migratePreset` | Explicit maintenance/test path only; not used by normal save/load | `npm run audit:preset-v2`, `npm run test:preset-migration` |
| Unsupported Product capabilities | `src/audio/product/ports/**` and `src/ui/productRuntimeConstruction.ts` | Typed unsupported capability or typed readiness failure; no silent callback/no-op fallback | `npm run core:product:runtime-fallbacks`, `npm run core:product:getter-policies`, `npm run core:product:live-note-contract` |
| Background Journey sample rate | `useBackgroundJourneyRuntimeSurface.ts` and `CoreProductBackgroundJourneyCoordinator.ts` | Uses Product/runtime telemetry; returns `sample-rate-unavailable` when absent | `npm run core:product:background-audio`, focused coordinator tests |
| Asset admission | `CoreProductAssetRegistrar.ts` and `CoreProductAssetWorkingSet.ts` | Shared working-set accounting with typed budget/release failures | `npm run core:product:asset-release`, `npm run core:product:asset-mobile-policy` |

No row above is a normal-runtime legacy repair or an unclassified fallback.

The current Package 4 checks no longer load the deleted Selected runtime or match
implementation body fragments for these guarantees. Runtime fallback and getter
behavior is exercised through the Product host harness, while reference-boundary
and declaration/import constraints are evaluated from the TypeScript AST. The
live-note contract combines executable lifecycle regression coverage with the
same AST boundary rule.
