# Kessho Product Reference Isolation

Old TypeScript audio code remains available for `web-ts` reference mode, parity comparison, migration conversion, and tests. It must not become the production musical brain for `core-product`.

## Allowed Core Product Imports

- Generated Product schema/event/param files.
- Product-specific host/runtime/event/snapshot/asset/telemetry modules.
- Type-only app interfaces from `src/audio/engine.ts`.
- Asset manifest helpers such as `pianoSamples` and the versioned `coreProductAssetManifest.json`.
- Unit/default helpers used only for serialization, such as `delayBuses`, `outputTrims`, `transport`, and selected UI state constants.
- `lead4opfm` only inside `coreProductSnapshot.ts` as a labeled `TEMP_COMPAT_WEB_REFERENCE` conversion bridge for exact Lead patch parity.

## Forbidden Production Imports

`core-product` production modules must not import old TypeScript musical-brain modules such as `engine`, `coreEngineHost`, `drumSynth`, `synthSeqEvolve`, `drumSeqEvolve`, `granularSeqEvolve`, `seqEvolveCore`, `drumSequencer`, `harmony`, `scales`, `rng`, preset randomizers, or legacy sonic parity harnesses as runtime dependencies.

## Retirement Rule

Temporary reference imports must have a documented bridge policy and a static audit. When equivalent generated Product Core IDs plus user overrides can reconstruct the state in C++/native, the reference import must be removed.
