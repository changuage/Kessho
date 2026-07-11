# Preset Sequencer Content-Hash Implementation Plan

## Status

Planning artifact only. Do not begin implementation until this plan is approved.

## Goal

Refactor preset persistence so that:

- every individual sequencer lane is stored as one immutable, content-addressed pattern
- all compatible Synth and Drum lane slots draw from the same physical pattern payload pool
- a pattern hash never includes the slot number, page, selected sound source, or sound preset
- Synth and Drum sound presets remain sound-only and never load sequencer state
- an L4 State restores sounds, patterns, and source bindings as independently composed state
- L4 storage no longer depends on a fully expanded resolved snapshot as its canonical representation
- saves and loads remain CPU-efficient through coarse hash boundaries and batched database access

This is an evolution of Preset Storage V2, not a replacement for preset identity, version history, or the existing content-addressed payload table.

## Non-Goals

- Do not change sequencer playback behavior, scheduling, generated music, or audio-engine semantics.
- Do not redesign the Synth or Drums pages.
- Do not expose internal pattern-content objects as extra preset-browser entries.
- Do not hash every step field or sub-lane independently.
- Do not bulk-rewrite all existing cloud presets during rollout.
- Do not make sound presets restore, clear, or otherwise mutate sequencer patterns.
- Do not force semantically incompatible Synth and Drum data to share a hash merely because their JSON values happen to look similar.

## Required Product Semantics

These invariants are non-negotiable:

1. Loading a Synth sound preset such as `Saturated Drift` changes sound state only.
2. Loading a Drum sound/kit preset changes sound state only.
3. Loading a saved sequence into a slot changes pattern-owned state only and preserves the slot's selected sound source, voice routing, enabled state, and gain.
4. Changing a slot's selected source does not change its pattern hash.
5. The same pattern can be assigned to multiple slots and sound sources without duplicating its payload.
6. Loading an L4 State restores sound refs, lane pattern refs, lane bindings, and global state.
7. L4 refs pin immutable content at save time. They must not silently follow later edits to a named pattern or sound preset.
8. Old presets remain readable. New saves use the new representation without destructive bulk migration.

## Current-State Facts

The implementation must re-verify these facts before editing because the worktree may have moved:

- `src/presets/types.ts` stores Synth and Drum sequencer data as flat `PresetVersionMetadata` arrays and objects.
- `src/presets/presetStorageV2.ts` currently folds full-source sequencer metadata into one `euclideanPattern` child below `source:synth` or `source:drums`.
- `src/presets/SupabasePresetStore.ts` hashes child payloads, creates hidden derived preset wrappers, writes ref rows, and also persists a complete `resolved_hash` payload.
- the load path returns the complete resolved payload before reconstructing from refs when that payload exists
- `src/ui/sequencer/sequencePresetLane.ts` already provides a shared per-lane copy/apply boundary
- `src/presets/euclideanPatternBank.ts` currently includes Synth note range and voice mask in Synth lane extraction, but Drum target routing is not included in Drum lane extraction
- `src/audio/sequencerLaneCounts.ts` currently defines four Synth lanes and six Drum lanes; no implementation may hard-code four lanes for both pages

## Target Ownership Model

```text
Named preset identity/version
|
+-- L3 Synth sound content hash          sound only
+-- L3 Drum sound content hash           sound only
+-- L4 local override hash               global state + slot bindings
+-- L4 metadata hash                     non-sequencer metadata only
`-- L4 direct pattern-content refs
    +-- sequencer.synth.0 -> pattern hash A
    +-- sequencer.synth.1 -> pattern hash B
    +-- ...
    +-- sequencer.drums.0 -> pattern hash C
    `-- ... lane counts are data-driven
```

The slot is the relationship layer. The pattern is analogous to a MIDI clip; the slot is the track; the selected source is the instrument.

### Pattern-Owned State

The canonical pattern payload may include only state that should travel when a user loads the saved sequence into another compatible slot:

- trigger clip and manual trigger edits
- effective step count, hits, rotation, and pattern shape needed for round-trip editing
- per-step probability, ratchet, and trigger conditions
- clock division and swing
- linked/polyrhythmic lane behavior that is intrinsic to the pattern
- sub-lane enablement, length, direction, and range mode
- expression, morph, distance, and nudge values
- portable pitch data with an explicit representation
- evolve configuration
- optional Synth arp/chord play configuration
- optional capability-specific fields whose semantics are explicitly identified

### L4 Slot-Binding State

The following must remain outside the pattern hash and be retained by L4/local runtime state:

- Synth/Drum page identity
- lane index or slot number
- selected Synth source
- selected Drum target voice or target mask
- Synth voice mask
- slot enabled/muted/solo state
- lane output level/gain
- source-specific parameter bindings
- source preset id/hash
- current UI selection, editor tab, playhead, hit counter, and transient gesture state

The implementation should leave these as their existing flat runtime keys in the L4 override unless a structured binding object demonstrably simplifies the persistence boundary. Do not introduce a second runtime source of truth merely to make storage look cleaner.

### Identity Metadata

Names, descriptions, tags, author, visibility, timestamps, colors, and preset-browser identity never participate in the pattern-content hash. A named sequence preset is a catalog/versioned identity that points to immutable pattern content.

## Canonical Pattern Schema

Add a dedicated persisted type rather than hashing an arbitrary subset of `SliderState` or `PresetVersionMetadata`.

Illustrative shape:

```ts
interface SequencerPatternContentV1 {
  kind: 'sequencer-pattern';
  schemaVersion: 1;
  trigger: {
    steps: number;
    pattern: boolean[];
    edits?: Array<{ step: number; value: boolean }>;
    generator?: PortableTriggerGenerator;
  };
  timing: {
    clockDiv: ClockDivision;
    swing: number;
    linked: boolean;
  };
  lanes: {
    probability?: number[];
    ratchet?: number[];
    trigCondition?: TrigCondition[];
    expression?: PortableSubLane;
    morph?: PortableSubLane;
    distance?: PortableSubLane;
    nudge?: PortableSubLane;
    pitch?: PortablePitchLane;
  };
  evolve?: PortableEvolveConfig;
  capabilities?: {
    synthPlay?: ProductPlayConfig;
    synthPitchBindingMode?: PitchBindingMode;
    slice?: PortableSubLane;
    reverse?: PortableSubLane;
  };
}
```

This is a design constraint, not a requirement to copy these exact field names. The final type should follow existing naming and serializers where possible.

### Pitch Representation

Synth and Drum currently convert pitch differently. The persisted payload must make the value domain explicit so equal hashes imply equal musical intent:

```ts
type PortablePitchRepresentation =
  | { kind: 'midi-note'; values: number[] }
  | { kind: 'scale-degree'; values: number[]; root: number; scale: ScaleName }
  | { kind: 'source-relative-semitone'; values: number[] };
```

Adapters may convert this representation for Synth or Drum playback, but they must not inject the selected sound source into the pattern. Note-range bounds are pattern-owned only if loading a pattern is expected to restore its musical register. Add a focused behavioral test documenting that decision.

### Capability-Specific Data

Use one physical pattern pool. Optional capability data is permitted when it changes sequence behavior:

- a pattern with Synth arp/chord configuration may have a different hash from a plain pattern
- Drum-only slice/reverse behavior may produce a different hash
- common patterns with the same complete canonical content should hash identically across compatible slots
- unsupported capabilities must be ignored safely by a destination adapter, not reinterpreted as another field

Do not add `synth` or `drum` to the hash envelope unless the payload's semantics genuinely cannot be expressed by the portable schema.

## Hashing Rules

The hash input must be the canonical schema envelope, including `kind` and `schemaVersion`.

Required normalization rules:

- sort object keys through the existing canonical JSON path
- sort serialized `Map` entries by numeric step
- normalize `undefined`, omitted defaults, and explicit defaults to one representation
- normalize `-0` and floating-point precision through the existing canonicalizer
- clamp values once before hashing, using the same rules used during restore
- normalize array lengths to effective lane/step lengths
- remove trailing values that cannot affect playback or editor round-trip behavior
- exclude display-only labels and timestamps
- preserve generator/provenance data only when it is required to restore editable behavior
- never include source ids, target masks, slot indices, page identifiers, or preset names

Add golden canonical-JSON and golden-hash fixtures. A schema change that alters canonical JSON requires a new `schemaVersion`; do not silently change V1 hashes.

## Database Target

### Keep

- `presets_v2` for user-visible logical identity
- `preset_versions_v2` for versions
- `preset_payloads_v2` for immutable hash-addressed JSON
- `preset_version_refs_v2` for existing preset-to-preset graph edges

### Add Direct Content References

Patterns are content objects, not hidden sound/source presets. Prefer a direct content-reference table over creating one hidden `presets_v2` and `preset_versions_v2` wrapper per unique pattern.

Target concept:

```sql
create table public.preset_version_content_refs_v2 (
  version_id uuid not null references public.preset_versions_v2(id) on delete cascade,
  ref_slot text not null,
  content_hash text not null references public.preset_payloads_v2(hash),
  content_type text not null,
  created_at timestamptz not null default now(),
  primary key (version_id, ref_slot)
);
```

The implementation must inspect the live schema and existing migration conventions before finalizing SQL. Do not copy this draft blindly.

Required ref slots:

```text
sequencer.synth.0
sequencer.synth.1
...
sequencer.drums.0
sequencer.drums.1
...
```

The slot identifies the destination during hydration but is never part of `content_hash`.

### Authorization and RLS

Before implementing database work:

1. Read the current Supabase changelog and relevant official docs.
2. Discover the installed CLI surface with `supabase --help` and `supabase --version`.
3. Inspect existing table policies, grants, and atomic save RPC authorization.
4. Create migrations through `supabase migration new`; do not invent filenames.
5. Enable RLS on any table in an exposed schema.
6. Authorize rows through their parent version/preset ownership model, not merely `TO authenticated`.
7. Prefer security-invoker behavior. Do not add a public `SECURITY DEFINER` function to bypass permission failures.
8. Update the atomic save/read RPCs so content refs and payloads commit in the same transaction.
9. Run database advisors and test authenticated reads/writes before committing migration output.

The physical payload pool may deduplicate only within an authorization realm if global deduplication would expose private payload existence or content.

## Save Pipeline

Implement the save path in this order:

1. Resolve and normalize the runtime preset snapshot exactly once.
2. Extract sound-only L3 children. Explicitly exclude all sequencer pattern and binding fields from sound child identity.
3. For each current Synth and Drum lane count, build `SequencerPatternContentV1` from the lane's slider and metadata state.
4. Build the canonical JSON once per lane and memoize by canonical string within the save operation.
5. Hash unique canonical strings in parallel using the existing Web Crypto hashing path.
6. Bulk-probe existing payload hashes once.
7. Insert only missing pattern payloads.
8. Write one direct content ref per non-empty lane using the slot naming convention.
9. Leave source selection, target/voice masks, enabled state, and gain in the parent L4 override.
10. Remove lane-owned sequencer fields from the L4 override and flat metadata before hashing those parent payloads.
11. Save identity, version, payloads, preset refs, and content refs atomically.

Do not perform one network request per lane or one hash per individual sub-lane field.

### Empty and Default Patterns

Define one canonical empty/default pattern. Reuse its hash across untouched slots rather than storing structurally different default payloads. Decide whether empty slots omit their ref entirely or reference the canonical empty hash; prefer omission if hydration can supply the same default without ambiguity.

## Load Pipeline

The L4 load path must treat the manifest/ref graph as authoritative:

1. Load the target preset version, local override, metadata, preset refs, and direct content refs.
2. Collect every unique payload hash required by the complete graph.
3. Fetch missing payloads in one bulk request and use the existing local hash cache.
4. Hydrate sound content without any sequencer mutation.
5. Route each pattern payload through its slot-specific Synth or Drum adapter based on `ref_slot`.
6. Reconstruct the existing flat sequencer runtime arrays only at the application boundary.
7. Apply slot-binding keys after pattern hydration so source routing cannot be overwritten by a pattern.
8. Apply global state and remaining metadata.
9. Emit explicit recovery warnings for missing or invalid pattern payloads and fall back to an empty pattern without changing the slot binding.

Loading a named individual sequence preset follows the same pattern adapter but targets only the selected slot and never applies an L4 binding.

## Resolved Snapshot Policy

The current expanded `resolved_hash` is useful as a cache but defeats much of the child-content storage gain when treated as canonical data.

Required end state:

- L4 canonical persistence is local override + metadata + preset refs + pattern content refs
- historical L4 versions do not store expanded resolved snapshots
- L4 loads succeed when `resolved_hash` is null
- a flattened latest snapshot may be retained only as an explicitly measured, evictable cache
- cache loss must never affect correctness or preset recoverability
- compact L4 manifests should be stored as full compact checkpoints rather than replaying long patch chains

Do not remove expanded snapshots until graph hydration and recovery tests pass. First make the ref graph authoritative, then stop writing historical snapshots, then measure whether the latest-cache copy is still justified.

Leaf pattern payloads remain fully resolved content objects; this policy concerns expanded composition snapshots.

## Compatibility Strategy

### Legacy Reads

When direct pattern refs are absent:

- continue reading existing flat `synth*` and `drum*` sequencer metadata
- continue reading the existing source-level combined `euclideanPattern` child
- preserve existing legacy L4 playback behavior
- do not require a bulk migration before the app can load presets

### New Writes

After the new save path is enabled:

- write direct per-lane content refs
- stop writing flat sequencer metadata into L4 metadata
- stop attaching sequencer children to newly saved Synth/Drum source presets
- never dual-write source-coupled sequencer children as the long-term state
- migrate a legacy preset naturally when the user saves its next version

### Direct L3 Loads

New L3 Synth/Drum loads must ignore sequencer children and metadata. If legacy source presets contain coupled sequencer state, direct L3 loading should still be sound-only; legacy sequence data is used only when reconstructing an old L4 composition. Add a regression test for this deliberate behavior correction.

### Existing Named Sequence Presets

Adapt existing `engine:euclideanPattern` entries to the new canonical pattern schema on read. Preserve old serializer support. A new version save should emit V1 content and exclude Synth voice masks/source routing from the pattern hash.

## Implementation Phases

### Phase 0: Baseline and Measurements

- [ ] Re-verify the current save/load graph and schema.
- [ ] Record representative L4 payload bytes, metadata bytes, ref counts, save time, and load request counts.
- [ ] Add or identify fixtures covering Synth patterns, Drum patterns, source routing, pitch modes, arp/chord behavior, evolve, and mute groups.
- [ ] Confirm all existing preset regression tests pass before edits.

### Phase 1: Canonical Pattern Domain

- [ ] Add the persisted V1 types and normalizers in a focused preset/sequencer module.
- [ ] Implement lane extraction for Synth and Drum without source binding.
- [ ] Implement Synth and Drum hydration adapters.
- [ ] Add canonical JSON and golden-hash tests.
- [ ] Prove changing source selection, voice mask, lane index, enabled state, or gain does not change the pattern hash.
- [ ] Prove changing musical pattern content does change the hash.

### Phase 2: Sound-Preset Decoupling

- [ ] Define an explicit ownership registry for sequencer pattern keys, slot-binding keys, and sound keys.
- [ ] Remove sequencer pattern fields from L3 Synth/Drum child extraction.
- [ ] Remove the combined `source -> euclideanPattern` child from new source saves.
- [ ] Ensure direct L3 loads never call sequencer restore paths.
- [ ] Add `Saturated Drift`-style sound-only load regressions.

### Phase 3: Database Content Refs

- [ ] Verify current official Supabase guidance and CLI capabilities.
- [ ] Create the direct content-ref migration through the repository's migration workflow.
- [ ] Add indexes for version lookup and content-hash maintenance if query plans justify them.
- [ ] Add ownership-aware RLS and grants.
- [ ] Extend atomic save RPC input to accept direct content refs.
- [ ] Extend detail/read RPC output to return all direct content refs and required payloads in bulk.
- [ ] Extend maintenance/orphan detection so directly referenced payloads are never deleted.
- [ ] Run migration verification, authenticated query tests, and database advisors.

### Phase 4: L4 Save Integration

- [ ] Extract all lanes using data-driven lane counts.
- [ ] Memoize canonicalization and hash each unique pattern once per save.
- [ ] Bulk-probe and insert pattern payloads.
- [ ] Write deterministic lane ref slots.
- [ ] Strip pattern-owned values from parent overrides and metadata.
- [ ] Keep binding-owned values in L4.
- [ ] Include content refs in version no-op/signature detection.
- [ ] Commit all save artifacts atomically.

### Phase 5: Graph-First Loading

- [ ] Load content refs and payloads in bulk.
- [ ] Hydrate lane patterns into existing runtime arrays.
- [ ] Apply bindings after patterns.
- [ ] Add missing/corrupt payload recovery warnings.
- [ ] Make L4 reconstruction pass with `resolved_hash = null`.
- [ ] Verify named pattern loading changes only the destination pattern.

### Phase 6: Legacy Migration-on-Save

- [ ] Add a legacy extractor for flat metadata and combined source children.
- [ ] Load old presets without writing anything.
- [ ] Convert to direct lane refs only when a new version is saved.
- [ ] Verify old and migrated versions produce equivalent runtime state.
- [ ] Do not delete legacy readers until production data no longer requires them.

### Phase 7: Expanded Snapshot Reduction

- [ ] Stop writing expanded resolved payloads for historical L4 versions.
- [ ] Update maintenance reports to measure removable resolved bytes.
- [ ] Validate graph-first load latency on cold and warm caches.
- [ ] Retain a latest resolved cache only if measured latency justifies its storage cost.
- [ ] Prove cache deletion does not change load results.

### Phase 8: Cleanup and Documentation

- [ ] Remove dead source-coupled write paths after rollout gates pass.
- [ ] Update the V2 migration plan, rollout runbook, and maintenance SQL documentation.
- [ ] Document the V1 canonical schema and versioning policy.
- [ ] Record before/after storage and CPU measurements.

## Expected Code Areas

The exact edit set must be confirmed before implementation, but likely areas are:

- `src/presets/types.ts`
- `src/presets/presetStorageV2.ts`
- `src/presets/SupabasePresetStore.ts`
- `src/presets/euclideanPatternBank.ts`
- `src/ui/sequencer/sequencePresetLane.ts`
- `src/ui/sequencer/stepOverrideSerialization.ts`
- `src/ui/usePresetSequencerRestore.ts`
- `src/ui/synth/SynthPage.tsx`
- `src/ui/drums/DrumPage.tsx`
- preset dedupe, metadata, storage, and soft-delete regression tests
- Supabase migrations and V2 maintenance/reporting functions
- `docs/PRESET_SUPABASE_V2_MIGRATION_PLAN.md`
- `docs/PRESET_STORAGE_V2_SUPABASE_ROLLOUT.md`

Prefer a new focused module such as `src/presets/sequencerPatternContent.ts` over adding more cross-domain serialization logic to `SupabasePresetStore.ts`.

## Required Regression Matrix

| Scenario | Required result |
| --- | --- |
| Same pattern in two Synth slots | One payload hash, two refs |
| Same compatible pattern in Synth and Drum | One payload hash when canonical musical semantics match |
| Same pattern with different selected sources | Same pattern hash |
| Same pattern enabled vs disabled | Same pattern hash |
| Same pattern with different slot gain | Same pattern hash |
| Different pitch representation | Different hash unless normalized musical intent is identical |
| Synth pattern with arp config vs plain pattern | Different hash |
| Load sound preset | No pattern or binding change |
| Load named pattern | Pattern changes; binding does not |
| Load L4 state | Sounds, patterns, bindings, and globals restore |
| Load legacy L4 | Existing runtime result preserved |
| Save legacy L4 as new version | New direct lane refs emitted |
| Missing pattern payload | Empty-pattern fallback; binding preserved; warning emitted |
| Deleted flattened cache | Graph load still succeeds |
| Repeated save with no semantic change | No new version or payload rows |

## Performance Gates

The implementation is incomplete unless these are measured:

- no per-lane network round trips during save or load
- no per-field/sub-lane content hashes
- canonicalization performed once per candidate payload per save
- duplicate lane payloads hashed or looked up once per save operation
- payload existence checked in bulk
- load fetches unique hashes in bulk
- L4 cold-load request count does not grow linearly with lane count
- warm-load behavior uses the existing hash cache
- save CPU and load latency do not regress materially against baseline
- database bytes for representative related L4 presets decrease after resolved-cache accounting

## Completion Gates

This work is complete only when all of the following are true:

1. All required product semantics and regression-matrix cases are automated and passing.
2. Direct per-lane pattern refs are visible in database inspection for a newly saved L4 preset.
3. Reused patterns produce one payload row and multiple refs.
4. L3 Synth/Drum presets contain no sequencer pattern data and do not mutate sequencers on load.
5. Pattern hashes are unchanged by source routing and changed by musical content.
6. A newly saved L4 preset loads correctly with its expanded resolved snapshot removed.
7. Legacy L4 presets load and migrate on save without data loss.
8. Atomic save rollback leaves no partial payload/ref/version graph.
9. RLS, grants, maintenance, orphan cleanup, and database advisors are clean.
10. Before/after storage, save CPU, load latency, and request-count evidence is recorded in the rollout document.

## Recommended Commit Boundaries

Keep commits independently reviewable:

1. canonical pattern types, normalizers, adapters, and tests
2. sound/source ownership split and load-semantics tests
3. direct content-ref schema, RLS, RPC, and maintenance changes
4. L4 save integration
5. graph-first load and recovery integration
6. legacy migration-on-save
7. resolved-snapshot reduction and performance evidence
8. documentation and dead-path cleanup

Do not combine generated audio-engine artifacts or unrelated runtime changes with this preset-storage work.
