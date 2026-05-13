# Kessho Product Reference Isolation

Old TypeScript audio code remains available for `web-ts` reference mode, parity comparison, migration conversion, and tests. It must not become the production musical brain for `core-product`.

## Allowed Core Product Imports

- Generated Product schema/event/param files.
- Product-specific host/runtime/event/snapshot/asset/telemetry modules.
- `CoreProductAssetAdapter` for host-owned fetch/decode/register I/O only.
- Type-only app interfaces from `src/audio/engine.ts`.
- Asset manifest helpers such as `pianoSamples` and the versioned `coreProductAssetManifest.json`.
- Unit/default helpers used only for serialization, such as `delayBuses`, `outputTrims`, `transport`, and selected UI state constants.
- `lead4opfm` only inside `CoreProductLegacyPresetCompat.ts` as a labeled `TEMP_COMPAT_WEB_REFERENCE` conversion bridge for exact Lead patch parity.

| Import path | Current reason | Owner | Classification | Replacement C++ Product Core owner | Retirement condition | Target removal phase |
| --- | --- | --- | --- | --- | --- | --- |
| `./generated/kesshoProductSchema` | Generated schema, defaults, preset IDs, and ABI constants | Product Core ABI | CANONICAL_GENERATED_SCHEMA_HELPER | Generated Product schema | Never remove while generated bindings are used | Required |
| `./generated/kesshoProductEvents` | Generated event IDs and ABI constants | Product Core ABI | CANONICAL_GENERATED_SCHEMA_HELPER | Generated Product event schema | Never remove while generated bindings are used | Required |
| `./generated/kesshoProductParams` | Generated param IDs and ABI constants | Product Core ABI | CANONICAL_GENERATED_SCHEMA_HELPER | Generated Product param schema | Never remove while generated bindings are used | Required |
| `./coreProductAssets` | Host asset fetch/decode/register adapter | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product asset registry and source schedulers | Keep as thin host I/O adapter | Required |
| `./CoreProductAssetAdapter` | Product host asset fetch/decode/register ownership boundary | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product asset registry and source schedulers | Keep as thin host I/O adapter; no source scheduling or tonal decisions allowed | Required |
| `./CoreProductHostSequencerAdapter` | Product host sequencer UI input normalization boundary | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product event dispatcher and sequencer UI state API | Keep as pure input adapter; no runtime scheduling or snapshot reload ownership allowed | Cleanup |
| `./CoreProductRuntimeAdapter` | Snapshot dirty-diff and reload classification boundary | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product event dispatcher and telemetry | Keep as thin generated-event adapter; no UI state ownership allowed | Cleanup |
| `./CoreProductLegacyPresetCompat` | Temporary exact patch and legacy preset conversion boundary | Snapshot adapter | TEMP_COMPAT_WEB_REFERENCE | C++ source preset/user override resolvers | Remove when Product Core reconstructs source patch state from generated IDs plus user overrides | Source parity closure |
| `./coreProductAssetManifest.json` | Versioned Product asset manifest | Product asset gate | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product asset IDs and registry | Keep as host packaging manifest | Required |
| `./coreProductEvents` | Generated Product event packing helpers | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product event dispatcher | Keep as thin ABI/event adapter | Required |
| `./coreProductRuntime` | WASM/worklet runtime bridge | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product render/runtime API | Keep as thin runtime adapter | Required |
| `./coreProductSnapshot` | Product snapshot assembly from generated fields | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product snapshot loader | Keep as serialization orchestration only | Cleanup |
| `./coreProductSnapshotEncoder` | Product snapshot generated ABI byte packing | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product snapshot loader | Keep as byte-layout-only encoder; no UI state ownership allowed | Cleanup |
| `./coreProductTelemetry` | Product telemetry/capability types | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product telemetry API | Keep as thin telemetry adapter | Required |
| `./CoreProductFallbackDiagnostics` | Core-product fallback/placeholder classification | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product telemetry/event APIs for missing surfaces | Remove only entries whose Product Core telemetry/event support exists | Cleanup |
| `./coreMidiEvents` | MIDI timestamp packing before Product event dispatch | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product MIDI event handling | Keep as host MIDI input adapter | Required |
| `./engine` | Type-only AudioEngine/UI contracts | Web Product host | CANONICAL_GENERATED_SCHEMA_HELPER | Thin host facade over C++ Product Core | Keep type-only import; runtime import remains forbidden | Required |
| `../native/capacitorMidiRouting` | Type-only native MIDI message interface | Web/native MIDI bridge | CANONICAL_GENERATED_SCHEMA_HELPER | C++ Product MIDI event handling | Keep type-only import | Required |
| `../ui/state` | UI serialization defaults only | Snapshot adapter | TEMP_COMPAT_WEB_REFERENCE | Generated Product defaults and C++ snapshot defaults | Remove when Product snapshot no longer imports UI state defaults | Cleanup |
| `./delayBuses` | Delay division conversion for generated Product params | Snapshot adapter | TEMP_COMPAT_WEB_REFERENCE | C++ Product delay time/division resolver | Remove when generated Product schema accepts UI delay-division IDs directly | FX/master closure |
| `./outputTrims` | Serialization trim constants | Snapshot adapter | TEMP_COMPAT_WEB_REFERENCE | Generated Product defaults and C++ master/source trims | Remove when trims are generated Product defaults | Cleanup |
| `./transport` | UI transport metrics serialization | Snapshot adapter | TEMP_COMPAT_WEB_REFERENCE | C++ Product transport snapshot/default conversion | Remove when Product snapshot receives generated transport fields directly | Deterministic transport closure |
| `./pianoSamples` | Asset manifest helper for host-decoded piano samples | Asset adapter | TEMP_COMPAT_WEB_REFERENCE | Product asset manifest plus C++ asset IDs | Remove when piano asset manifest generation owns the lookup fully | Asset manifest closure |
| `./lead4opfm` | Exact Lead patch parity bridge in `CoreProductLegacyPresetCompat.ts` | Snapshot adapter | TEMP_COMPAT_WEB_REFERENCE | C++ Lead source preset/user override resolver | Remove when C++ reconstructs Lead patch state from generated preset IDs plus user overrides | Source parity closure |

## Forbidden Production Imports

`core-product` production modules must not import old TypeScript musical-brain modules such as `engine`, `coreEngineHost`, `drumSynth`, `synthSeqEvolve`, `drumSeqEvolve`, `granularSeqEvolve`, `seqEvolveCore`, `drumSequencer`, `harmony`, `scales`, `rng`, preset randomizers, or legacy sonic parity harnesses as runtime dependencies.

Classification vocabulary:

- `CANONICAL_GENERATED_SCHEMA_HELPER`: generated Product schema/ABI helper or thin Product host adapter.
- `TEMP_COMPAT_WEB_REFERENCE`: temporary web compatibility bridge with a Product Core replacement owner and removal phase.
- `TEMP_COMPAT_NATIVE_REFERENCE`: temporary native compatibility bridge; none are allowed in web Product host code without a table row.
- `TEST_ONLY_REFERENCE`: reference import allowed only in tests/parity harnesses, never Product host runtime.
- `DEPRECATED_BRIDGE_FIELD`: snapshot/ABI bridge field retained only until C++ can reconstruct state from generated IDs plus user overrides.
- `FORBIDDEN_FOR_CORE_PRODUCT`: old musical-brain runtime dependency that must fail static audit.

## Retirement Rule

Temporary reference imports must have a documented bridge policy and a static audit. When equivalent generated Product Core IDs plus user overrides can reconstruct the state in C++/native, the reference import must be removed.
