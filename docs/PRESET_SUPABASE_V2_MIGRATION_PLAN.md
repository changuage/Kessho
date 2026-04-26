# Preset Supabase V2 Migration Plan

## Goal

Move Kessho preset storage from the current single-row, inline-`versions` JSON model to a normalized Supabase schema that:

- keeps Supabase as the base source of truth across devices
- minimizes duplication across L1, L2, L3, and L4 presets
- stores version history as lightweight patches instead of rewriting entire rows
- allows shared testing mode where every authenticated user can see and update the same shared presets
- creates hidden derived child presets for unsaved lower-level edits so sibling presets can reuse exact hashes without public dropdown clutter
- preserves the current latest `String Waves` as the canonical state preset during cutover

The companion SQL draft is:

- [preset_storage_v2.sql](/Users/panguroo/Documents/generativemusic/docs/preset_storage_v2.sql:1)
- [preset_storage_v2_internal_derived.sql](/Users/panguroo/Documents/generativemusic/docs/preset_storage_v2_internal_derived.sql:1) for existing V2 databases

## Why This Is Better

The current cloud shape stores one logical preset per row with an inline `versions` JSONB array. That causes three forms of waste:

1. Updating one version rewrites the whole row.
2. Higher-level presets duplicate lower-level sound data.
3. Identical payloads across presets are stored repeatedly.

The V2 model fixes those separately:

- `presets_v2` stores logical identity only.
- `preset_versions_v2` stores one row per version.
- `preset_version_refs_v2` stores the graph edges between levels.
- `preset_payloads_v2` deduplicates JSON blobs by content hash.

## Testing-Phase Ownership Model

For the current testing phase, every preset should live in one shared editable namespace.

That means:

- all migrated presets use `owner_key = 'public'`
- `owner_user_id` is optional metadata, not a write gate
- stock/factory presets are also shared and editable
- `author = 'factory'` and `library = 'stock'` remain useful labels, but they do not make a row immutable yet

So during this phase there are no private copies and no protected factory rows. Everyone edits the same cloud library.

Later, when testing ends, the policies can be tightened without changing the storage model.

## Table Roles

### `presets_v2`

One logical preset identity.

Use it for:

- name
- scope
- level
- family and variant metadata
- visibility
- latest version pointers

This row should stay small and stable.

### `preset_versions_v2`

One row per version.

Use it for:

- version number
- note
- patch mode
- override blob hash
- metadata blob hash
- resolved snapshot hash

This avoids rewriting an entire preset row every time a version is saved.

### `preset_version_refs_v2`

Explicit child references for that version.

Examples:

- state preset -> `synth`, `drums`, `granular`, `delay`, `reverb`, `earth`
- synth source -> `pad1Kit`, `pad2Kit`, `lead1Kit`, `lead2Kit`, `leadDelay`, shared `euclideanPattern`
- drums source -> `drumKit`, shared `euclideanPattern`
- granular source -> `granularKit`
- delay source -> `delayKit`
- kit presets -> their owned L1 engines, for example `pad1Kit -> pad1`, `drumKit -> drumSub/drumKick/...`, `granularKit -> granularVoice1/...`, `delayKit -> leadDelay/echoLine/clockedSpace`

Each ref may also carry a small per-child override blob.

If no intentionally saved child preset has the exact content hash, the V2 save path creates a private hidden child named `__derived__/{scope}/{hash12}` and tags it `internal-derived`. These rows are still readable for ref resolution, but the app filters them from preset lists and dropdowns.

### `preset_payloads_v2`

Content-addressed JSON storage.

This is where dedupe happens.

If twenty presets reference the same pad payload or metadata payload, Supabase stores that JSON once and everything else points to the hash.

## Storage Strategy By Level

### L1 `engine`

Store:

- full normalized engine payload in `override_hash`
- resolved snapshot hash

Version history:

- `v1` can be `snapshot`
- later versions should usually be `patch`
- create a checkpoint every 8 to 12 versions

### L2 `kit`

Store:

- refs to child L1 presets
- only kit-owned params as overrides
- resolved snapshot hash

Do not inline child engine snapshots unless the child is unsaved or intentionally embedded.

Shared rhythm patterns should live once as L1 `euclideanPattern` presets. Drum and synth Euclidean source data can reference that bank, with only instrument-specific lane, target, velocity, or pitch overrides remaining on the parent.

### L3 `source`

Store:

- refs to L2 and direct L1 children
- only source-owned params as overrides
- resolved snapshot hash

This is where most of the savings start showing up.

### L4 `state`

Store:

- refs to major L3 sources
- only global and cross-source overrides
- resolved snapshot hash

This is where `String Waves` and its sibling variants benefit the most.

## Version Strategy

Use three version modes:

- `snapshot`: first version or forced full checkpoint
- `patch`: small delta from previous version
- `checkpoint`: full resolved snapshot every N versions

Recommended policy:

1. Always keep the latest resolved snapshot cached on `presets_v2`.
2. Store the latest version row with `resolved_hash`.
3. Store intermediate versions as patch rows when possible.
4. Force a checkpoint every 8 versions or when patch replay would exceed a reasonable payload threshold.

This keeps loads fast without giving up compact version history.

## How `String Waves` Should Look In V2

The latest canonical `String Waves` should be migrated first and treated as the gold reference preset.

Example target shape:

```text
presets_v2
  type = state
  scope = global
  name = String Waves
  latest_version_no = 1

preset_versions_v2
  storage_mode = checkpoint
  override_hash = hash(global-only overrides)
  metadata_hash = hash(slider modes + dual ranges + evolve metadata)
  resolved_hash = hash(full resolved state)

preset_version_refs_v2
  synth    -> String Waves Synth
  drums    -> Silent Drums or String Waves Perc
  granular -> Legacy Cloud / migrated granular source
  reverb   -> String Waves Cathedral
  delay    -> String Waves Delay
```

If a second state preset reuses the same synth and granular setup, only the changed refs or overrides need new rows. The reused child payloads stay shared.

## Migration Phases

### Phase 0: Freeze Legacy Shape

Before migrating:

- stop editing the SQL in [public/presets/supabase_migration.sql](/Users/panguroo/Documents/generativemusic/public/presets/supabase_migration.sql:1)
- treat the current cloud `presets` table as legacy
- take a SQL backup or table copy

Recommended action:

```sql
alter table presets rename to presets_legacy;
```

Do this only on the cutover branch when the V2 client work begins.

### Phase 1: Create V2 Tables

Run [preset_storage_v2.sql](/Users/panguroo/Documents/generativemusic/docs/preset_storage_v2.sql:1).

This creates:

- `presets_v2`
- `preset_versions_v2`
- `preset_version_refs_v2`
- `preset_payloads_v2`

At this stage, the existing app will still be reading the legacy table.

### Phase 2: Seed Factory Presets Once

Do not let clients seed factory presets on every boot anymore.

Instead:

1. Run a one-time import into the shared namespace.
2. Insert factory L1, L2, and L3 presets into `presets_v2` with `owner_key = 'public'`.
3. Hash and dedupe their payloads through `kessho_put_payload_v2`.

This avoids duplicate factory rows, makes shared refs stable, and still lets all testers edit those rows.

### Phase 3: Migrate `String Waves` First

Because the current latest `String Waves` is the only legacy state preset that matters, migrate it manually before bulk migration.

Steps:

1. Resolve the latest `String Waves` into a full state snapshot.
2. Split it into:
   - L4 global/state overrides
   - child source refs
   - version metadata
3. Insert only the latest canonical version into V2.
4. Verify the migrated V2 preset loads identically in the app.

Do not migrate old `String Waves` versions unless they are truly needed.

### Phase 4: Migrate Shared Child Presets

Migrate the child presets referenced by `String Waves` next:

- synth source
- granular source
- delay source
- reverb source
- drums source or silent drums source

For each one:

1. resolve its latest snapshot
2. normalize it
3. split owned params from child refs
4. write payload hashes
5. create version 1 as a checkpoint

This gives the top-level state preset real shared building blocks.

### Phase 5: Migrate Remaining Shared Presets

After `String Waves` works correctly, bulk-migrate other presets.

Recommended rules:

- migrate latest version only for low-value legacy presets
- preserve full version chains only for presets still actively edited
- skip orphaned or duplicate legacy presets

Because the current testing phase values clean shared storage over historical fidelity, this is the right tradeoff.

All of these migrated presets should stay in the shared editable namespace for now, including stock/factory rows.

### Phase 6: Dual-Write Cutover

Update the client in two steps:

1. Read from `presets_v2`, fall back to `presets_legacy`.
2. Once reads are verified, write only to `presets_v2`.

During cutover, avoid writing to both forever. Dual-write should be temporary.

### Phase 7: Compaction Pass

Once V2 is live, run a cleanup pass:

- collapse identical payload hashes
- mark repeated patch chains for checkpointing
- archive duplicate logical presets
- remove or archive legacy rows that are no longer referenced

Suggested rule:

- if two presets have the same `owner_key`, `type`, `scope`, `name_key`, and latest `resolved_hash`, keep only the newest logical row

This phase should be treated as part of the V2 operating model, not as optional maintenance.

Recommended cadence:

- run a lightweight checkpoint review daily during active testing
- run a fuller duplicate-compaction pass weekly
- create a new checkpoint whenever a version chain crosses 8 versions
- also create a checkpoint whenever the patch payload grows to roughly 65 percent of the full snapshot size

### Phase 8: Retire Legacy Table

After verification:

- keep `presets_legacy` as backup for a short period
- then archive or drop it

Optionally create a compatibility view if any admin tooling still expects a single `presets` table.

## Recommended Client Cutover Order

To reduce risk, wire the client in this order:

1. read V2 latest preset identities
2. read V2 latest resolved snapshots
3. resolve V2 refs for L4 state presets
4. save V2 latest versions
5. save V2 patch versions
6. expose version history from `preset_versions_v2`

This keeps the first production cutover simple: latest load and latest save before historical tooling.

## Data Normalization Rules

Before hashing or diffing any payload:

1. remove keys equal to engine defaults
2. remove keys equal to referenced child preset values
3. round unstable floats to a consistent precision
4. sort keys through JSONB normalization
5. split sound payload and metadata payload

Without this, hash dedupe will underperform.

Canonical normalization should be treated as part of V2 itself, not a later enhancement.

Recommended canonicalization contract:

- normalize every payload before any hash, patch, or ref comparison is computed
- round numeric values to a stable precision before hashing
- sort object keys recursively
- remove `undefined` and transient UI-only values
- normalize optimized L4 state snapshots back to a stable comparison shape before child-ref matching
- hash the canonical payload, not the original runtime object

## What Not To Migrate As-Is

Do not carry these legacy behaviors into V2:

- inline `versions` arrays on the parent preset row
- boot-time client seeding of factory presets into cloud storage
- select-then-update cloud save logic as the long-term write path
- duplicate full state snapshots for every state variant
- early permission lockdown on stock/factory presets during the shared testing phase

## Remaining Follow-Up Work After First Client Pass

The first client pass can already target the V2 schema with canonical payload hashing, legacy fallback, and checkpoint-aware version rows.

The remaining implementation tasks should be:

1. run the SQL migration in Supabase so the V2 tables and policies actually exist remotely
2. migrate the latest canonical `String Waves` and its shared children into `presets_v2`
3. seed or migrate the shared factory presets so ref inference can reuse them instead of inlining them
4. add an admin migration script for one-time legacy-to-V2 import and cleanup
5. add scheduled database compaction and orphan-payload cleanup on the Supabase side

## Recommended Success Checks

The migration is successful when all of these are true:

- latest `String Waves` loads identically from V2
- creating a sibling `String Waves` variant does not duplicate unchanged child payloads
- updating a preset version writes one new version row instead of rewriting one giant parent row
- duplicate pad/drum/granular payloads collapse onto shared hashes
- all users in testing can still see and update the shared presets
