# Preset persistence architecture

Status: current production architecture and required release policy, 2026-07-31.

This document describes the persistence boundary for the five preset levels (`engine`, `kit`, `source`, `state`, and `journey`). It covers browser-local persistence, Supabase V2 persistence, hybrid routing, write serialization, schema validation, Journey reference cleanup, performance constraints, security constraints, deployment gates, and retirement of the remaining legacy storage surface.

## Architectural invariants

1. Every normal save passes through the current schema boundary before a store writes it.
2. A logical preset has a stable identity and an ordered version history. A rename does not create a new identity.
3. Generic saves/compaction and Journey read-modify-write operations use the same canonical keyed queue. Writes to unrelated keys may run concurrently.
4. Identity metadata is updated separately from versioned musical content and uses compare-and-set revisions.
5. Supabase runtime reads and writes use V2 only. Missing V2 capabilities fail closed; they do not fall back to legacy cloud rows.
6. Supabase payload bodies are immutable and content-addressed. Manifest rows, graph edges, and metadata hashes refer to those bodies.
7. List screens read summaries, not complete histories. Journey previews are summary metadata and are fetched in a batch.
8. Destructive reference cleanup considers only current-version referrers, identifies them by stable ID where possible, and revalidates inside the same keyed write queue used by normal saves.
9. Retries and background refreshes are bounded, coalesced, and cancelled or ignored when their scope becomes stale.
10. Browser-visible database surfaces are narrow, explicitly granted, and guarded by row visibility or equivalent predicates.

## Current application schema

[`currentPresetSchema.ts`](../src/presets/currentPresetSchema.ts) defines the fail-closed `preset-entry-v2` application contract. A valid `PresetEntry` has:

- one of the five supported levels;
- a non-empty name, supported author/library/visibility values, and finite timestamps;
- at least one version, with unique ascending version numbers;
- a `currentVersion` that selects an existing version;
- JSON-compatible, finite values under an allowlist appropriate to its level and scope;
- current canonical scope names, not migration aliases.

Journey data has a separate closed allowlist and requires format version 1, a name, boolean auto-advance and loop flags, nodes, and connections. Unknown Journey keys are rejected. Generic parameter data is similarly limited to registered parameters and explicit special keys. The decoder does not repair data, add defaults, synthesize IDs, or canonicalize legacy aliases.

The persistent application types live in [`types.ts`](../src/presets/types.ts). Important identities are:

- `id`: stable logical identity across versions and renames;
- `currentVersion`: selected musical-content version;
- `updatedAtRevision`: opaque store revision used for metadata CAS;
- `remoteId`: cloud identity exposed through summaries where needed;
- `recoveryWarnings`: explicit degraded-load information, never silent graph repair.

Content ownership is classified in [`contentOwnership.ts`](../src/presets/contentOwnership.ts) as portable content, slot binding, arrangement-global state, identity metadata, derived runtime cache, or user preference. Only owned persistent fields cross the storage boundary. Runtime caches and preferences must not leak into version payloads.

### Lead4op envelope and read bridge

The current Lead4op scope is `lead4opfm`. Its canonical data is:

```ts
{
  format: "kessho-lead4opfm-preset",
  formatVersion: 1,
  preset: { /* closed, structurally validated Lead4op patch */ }
}
```

[`lead4opPresetPayload.ts`](../src/presets/lead4opPresetPayload.ts) owns this envelope and its explicit nested field allowlists. `createLead4opFMPresetData` constructs the canonical envelope; `readLead4opFMPresetData` accepts only the exact current shape. The codec permits a narrow read bridge for old raw patches and `{ preset }` wrappers, including the known editorial annotation fields. `sanitizeLead4opFMPresetJson` copies only current persisted fields, so a canonical rewrite strips those annotations and arbitrary runtime properties.

The bridge is read-only compatibility, not a second write schema. New or edited Lead4op content must be sanitized, enveloped, and validated before persistence.

## Canonical command boundary

[`presetCommands.ts`](../src/presets/presetCommands.ts) is the UI-independent write boundary for generic saves.

`buildPresetSavePlan` is pure. It clones input, removes `undefined` values that JSON cannot preserve, normalizes tags and metadata, strips internal-derived references, validates through `decodeCurrentPresetEntry`, and produces one of:

- `create`: private user entry at version 1;
- `update`: append the next version while retaining stable identity and earlier versions;
- `noop`: return an immutable equivalent when data, version metadata, tags, note, and identity did not change.

An optional `expectedVersion` rejects stale content saves. Factory/stock entries may be used as read-only templates, but are forked into a private user preset rather than overwritten.

`PresetCommandService` serializes operations by:

```text
type : canonical-scope : trimmed-lowercase-name
```

It keeps a promise tail per key and removes completed tails. The service is cached per `IPresetStore` in a `WeakMap`, so multiple UI surfaces using the same store share the same queue. Generic save, rename, remove, metadata, interactive import, lazy local compaction, and the corresponding Journey mutations all participate. Rename reserves the sorted old-name and new-name keys together, preserving stable identity across the transition while unrelated presets remain concurrent. State deletion continues to revalidate Journey cleanup inside its lane before the final store delete.

Interactive import also uses the keyed command boundary. A collision appends the imported current version under the existing writable stable ID; a new logical name preserves the validated imported history; a visible read-only preset is forked into a user-owned row. Administrative bulk restore rejects logical-key collisions before writing instead of silently overwriting live data.

## Store boundary

[`PresetStore.ts`](../src/presets/PresetStore.ts) defines `IPresetStore`. The interface exposes current-schema save/load/list operations, stable-ID loads, rename, metadata CAS, deletion, current-reference candidate lookup, storage reporting, and import/export.

### LocalStoragePresetStore

The local store is the offline and stock/factory backend.

- Keys are logical `type/scope/name` keys in browser `localStorage`.
- Save decodes the current schema, applies version retention/compression at the store boundary, and stamps a monotonically advancing local revision.
- Load and list decode every returned entry and ignore invalid or slot-incompatible data.
- Metadata updates verify optional target ID and exact `expectedUpdatedAt`, then save without adding a musical-content version.
- Current-reference lookup examines only each entry's current version. For state deletion it limits candidates to Journeys.
- Full scans are accepted only because the dataset is local and bounded; this behavior must not be copied to cloud list or reverse-reference paths.

### SupabasePresetStore

[`SupabasePresetStore.ts`](../src/presets/SupabasePresetStore.ts) is the normal cloud backend. Runtime operations use the V2 tables, views, and RPCs. Legacy helpers are isolated for migration and maintenance; a missing V2 RPC/schema is an error, not permission to write legacy data.

The normal list path reads a narrow page from `preset_summaries_v2`, excludes deleted/internal-derived rows, and does not fetch version history. Default detail load uses the lightweight latest-manifest RPC; an explicitly selected historical version uses the detail bundle. Payload bodies are fetched only for missing hashes and verified before entering the payload cache.

Writes are atomic through `kessho_save_preset_v2`. The request carries the logical row change, version manifest, unique missing payload bodies, preset graph references, and direct content references. A failure rolls back the entire logical write.

### HybridPresetStore

[`HybridPresetStore.ts`](../src/presets/HybridPresetStore.ts) combines local stock content with cloud-backed mutable content.

- Without cloud, all operations use local storage.
- With cloud, non-stock/non-factory content is cloud-managed; successful cloud writes remove obsolete mutable local mirrors.
- Lists merge cloud summaries with local stock summaries, deduplicate case-insensitively by name, and prefer cloud/user content over stock on collision.
- Loads prefer cloud and may fall back only to local stock/factory content. Cloud availability never exposes a stale mutable local mirror as authoritative.
- Shared test mode makes cloud authoritative for all presets.
- Current-reference candidates are requested from local and cloud concurrently, merged by stable ID when available, and reduced to the freshest opaque revision.

## Supabase V2 storage graph

The reference schema is in [`preset_storage_v2.sql`](preset_storage_v2.sql); versioned migrations remain the deployment authority.

| Object | Responsibility |
| --- | --- |
| `presets_v2` | Stable identity, owner and visibility, logical name/scope, soft-delete state, and latest-version/hash rollups |
| `preset_versions_v2` | Immutable ordered manifests: snapshot, patch, or checkpoint |
| `preset_payloads_v2` | Immutable canonical JSON bodies keyed by a 64-hex content hash and payload kind |
| `preset_version_refs_v2` | Version-to-preset graph edges, including fixed-version and follow-latest references |
| `preset_version_content_refs_v2` | Direct references from a version to reusable opaque content payloads |

Payload hashes are computed from canonical JSON text. Equal content is uploaded and stored once. A hash may not silently change payload kind. Save probes for already-present hashes and transmits only missing bodies; the server validates every referenced body and graph edge inside the atomic transaction.

Version storage uses deltas only when they reduce work and bytes. Every eighth version is a checkpoint, and a patch at least 65% as large as a snapshot is stored as a snapshot instead. Parent links and foreign keys preserve graph validity; maintenance converts vulnerable orphan patch chains to checkpoints before deletion. Missing or invalid child content produces an explicit recovery warning and a safe disabled/empty/default fallback.

### Batched Journey summary previews

`journeyPreview` is version metadata rolled up through `latest_metadata_hash`. A Journey list:

1. fetches the bounded summary page;
2. deduplicates all non-empty latest metadata hashes;
3. resolves missing metadata payloads in one batched payload request;
4. validates and attaches previews to summaries.

It must not issue one detail request per Journey. The UI keeps a bounded 96-entry preview cache; its bounded detail fallback exists for incomplete backends, not as the normal Supabase path.

## Metadata compare-and-set

Identity metadata changes do not create a new preset version.

The UI must pass both the stable target ID and the raw `updatedAtRevision` captured with the summary. It must not parse and reformat a PostgreSQL timestamp before CAS. `kessho_update_preset_metadata_v2` locks the active target row, validates the metadata key allowlist and ownership, compares the exact expected `updated_at`, and raises SQLSTATE `40001` when stale. The store maps that to `PresetMetadataConflictError`; the caller refreshes rather than silently overwriting.

The local store implements the same contract with a monotonic string revision derived from its timestamp. Hybrid metadata writes prefer cloud and remove a stale mutable local mirror after success.

## Journey referrer discovery and cleanup

[`journeyPresetReferences.ts`](../src/presets/journeyPresetReferences.ts) owns state-to-Journey lifecycle cleanup.

Cloud discovery calls `kessho_find_journey_state_referrers_v2(target_state_id)`. The query is stable-ID addressed and joins only graph edges belonging to each Journey's current version (`latest_version_id`). It returns compact candidates containing ID, name, current version, and opaque revision. Historical-only referrers are not blockers.

Candidate lookup is intentionally a two-stage process:

1. the store returns cheap current-version candidates;
2. the application loads only those candidates, with detail concurrency limited to six, and verifies the decoded current refs/data.

Deletion then fails closed:

- stock/factory or otherwise read-only Journey referrers block deletion;
- any discovery or cleanup error blocks deletion;
- confirmed mutable referrers are cleaned with concurrency limited to four;
- each cleanup runs in the canonical Journey key queue and revalidates after acquiring it;
- if a Journey was renamed, cleanup resolves its stable ID, moves to the new-name queue, and revalidates again;
- cleanup removes the state node/ref, rebuilds the preview, retains the previous current version as the immediate backup, and appends the cleaned version.

Only after all required cleanup succeeds may the state preset be deleted.

## Coalescing, cancellation, and retries

Generic preset list refreshes coalesce per store/type/scope generation. Changing store or scope increments the generation, clears pending timers, and prevents stale responses from committing. An empty cloud-only list may retry at most four times with `attempt × 1500 ms` delay. There is at most one retry timer, and unmount/scope change cancels it.

Journey list refreshes coalesce per active store and ignore results from a replaced store. Reference resolution deduplicates state loads by identity. Supabase additionally coalesces identical in-flight list requests, uses bounded memory/session summary caches, and opens a two-minute read circuit after qualifying failures rather than continuously retrying a broken endpoint.

Retry code must preserve these rules:

- no unbounded polling;
- no overlapping request for the same generation/key;
- no state commit after cancellation or scope replacement;
- no retry that changes write semantics or falls back to legacy storage;
- no timer or in-flight registry entry retained after completion.

## CPU, network, and storage budgets

These are architectural constraints, not optional optimizations.

### CPU

- Schema validation and canonical hashing occur at command/store boundaries, not on audio or render hot paths.
- List screens operate on summaries and bounded preview payloads, never reconstruct every version.
- Same-key serialization uses promise tails; it does not poll or spin.
- Detail and cleanup fan-out uses fixed worker bounds.
- Preview and payload caches are bounded or TTL-limited.
- Delta reconstruction is bounded by periodic checkpoints.

### Network

- No N+1 detail loads for lists or Journey previews.
- Summary queries select only UI fields and use bounded first pages (24 for the normal list, 50 for management paths).
- Payload requests deduplicate hashes and fetch only cache misses, with at most 100 hashes per payload request.
- Default load fetches a latest manifest rather than full history.
- Repeated list/detail reads use coalescing and verified caches; failures use circuit breaking.

### Storage

- Canonical JSON plus content hashes make payload bodies immutable and reusable.
- Atomic save prevents partial manifests, refs, or payload graphs.
- Foreign keys use deliberate `CASCADE`, `RESTRICT`, or `SET NULL` behavior according to ownership.
- Soft deletion preserves restorable visible graphs; maintenance recycles only unreachable internal-derived graphs.
- Version compression/checkpoints must preserve exact current and selected-version loads.
- List/session caches contain summaries only and are invalidated on mutation or user change.

## Database security constraints

All new browser-callable persistence surfaces require an explicit security review.

The metadata-CAS and Journey-referrer functions are deliberately `SECURITY DEFINER` because they provide narrow operations over tables whose broad browser access is being retired. They are acceptable only with all of these constraints:

- `SET search_path = ''`;
- every relation and function reference fully schema-qualified;
- explicit authenticated-user checks;
- ownership and visibility checks inside the function;
- validation of all identifiers, JSON shapes, and allowed fields;
- no dynamic SQL derived from caller input;
- `REVOKE EXECUTE ... FROM PUBLIC` and `anon`;
- an explicit `GRANT EXECUTE ... TO authenticated`;
- regression coverage for current-version filtering, ownership, visibility, stale revisions, and grants.

Do not add a broadly callable definer function to work around an RLS or privilege failure. Prefer invoker/RLS behavior when it can express the operation safely.

The effective `preset_summaries_v2` migration is a deliberate exception: the later revoke-safe view is `security_barrier = true` and `security_invoker = false`, with explicit visibility predicates, so narrow summaries can remain readable after base-table `SELECT` is revoked. It exposes no payload bodies or histories. Any change to its columns or predicates must rerun the API-surface, security, and revoke-readiness audits. The legacy summary view has the same temporary shape and must be removed by the retirement plan below.

Base-table privilege removal is a deployment gate, not an assumption: revoke only after all narrow summary/detail/save/maintenance APIs are deployed and verified. RLS remains enabled as defense in depth, and direct content-ref tables are not browser APIs.

## Migration and deployment gates

Apply changes in this order:

1. **Preflight:** back up/export legacy rows; run schema, security, API-surface, hash-golden, graph-authority, and egress audits against the target environment.
2. **Additive database rollout:** apply V2 tables/constraints, RLS, narrow summary/detail/payload RPCs, atomic save, metadata CAS, and current-version referrer RPCs. Do not revoke old access yet.
3. **Dry-run migration:** run the V2 migrator without its confirmation token; inspect counts, unsupported records, hash conflicts, graph/ref gaps, and recovery warnings.
4. **Confirmed migration:** write only with the explicit `MIGRATE_PRESETS_V2` confirmation, then verify row/version/hash/ref parity and exact selected-version loads.
5. **Application rollout:** deploy the V2-only runtime. A missing V2 capability must fail closed. Observe errors, egress, payload cache verification failures, CAS conflicts, and any maintenance-only legacy reads.
6. **Privilege hardening:** run `audit:supabase-security`, `audit:supabase-api-surface`, `audit:supabase-revoke-readiness`, and the strict/repeated egress audits. Revoke base-table reads only when all narrow APIs prove sufficient.
7. **Maintenance gate:** run V2 graph/payload maintenance in dry-run mode first, then confirmed mode; verify checkpoints, reachability, soft-delete restoration, and payload reclamation.
8. **Retirement gate:** remove a legacy surface only after the zero-read observation and rollback requirements below are met.

A migration is not complete merely because SQL applied successfully. Counts, exact load behavior, graph reachability, grants, and runtime egress are release criteria.

## Test matrix

The minimum application regressions are:

- `presetCommands.test.ts`: create/update/no-op planning, conflicts, read-only forks, internal-ref stripping, same-key serialization, store-scoped services, and compaction races;
- `journeyPresetReferences.test.ts`: current-candidate loading, stable-ID rename handling, bounded cleanup, concurrent-save preservation, read-only blockers, and Hybrid candidate merging;
- `presetSoftDeleteRegression.test.ts`: local/cloud metadata CAS, summary previews, V2 atomic writes, current-version referrer RPCs, graph deletion/restore, payload caching, and failed-closed behavior;
- current schema and Lead4op asset tests for envelope validation and legacy read compatibility.

Required package gates for a persistence release include:

```text
npm run test:preset-current-schema
npm run test:preset-metadata
npm run test:preset-content-ownership
npm run test:preset-content-refs-db
npm run test:preset-lifecycle-db
npm run test:preset-graph-authority
npm run test:preset-exact-load
npm run test:preset-dedup
npm run test:preset-soft-delete
npm run test:preset-hash-golden
npm run test:cloud-preset-edge
npm run test:lead4opfm-v2-presets
npm run audit:preset-v2
npm run audit:supabase-egress
npm run audit:supabase-wide-rpc
npm run audit:supabase-api-surface
npm run audit:supabase-security
npm run audit:supabase-revoke-readiness
npm run audit:supabase-optimization-db-proof
npm run benchmark:preset-content-graph
npm run build
```

Database-backed tests and strict runtime egress audits require a disposable or designated test Supabase environment. Never point destructive lifecycle/maintenance tests at production.

## Legacy retirement plan

Legacy cloud persistence is not part of normal runtime, but the legacy table/view/RPC and maintenance/migration helpers still exist. Retire them in explicit phases:

1. **Inventory and preserve:** export legacy rows and record counts, owners, versions, unsupported shapes, and hashes. Keep a dated rollback artifact.
2. **Migrate and prove parity:** dry-run, migrate with explicit confirmation, then verify logical counts, selected versions, payload hashes, graph edges, metadata, and representative application loads.
3. **Observe V2-only runtime:** keep any legacy reads confined to instrumented maintenance tooling. Require a defined zero-read window with no runtime fallback and no unresolved V2 recovery warnings.
4. **Revoke legacy access:** remove browser grants from legacy detail RPCs, summary views, and base tables after security/API/revoke-readiness audits pass. Keep controlled administrative export available for rollback.
5. **Remove application debt:** delete legacy store helpers, telemetry branches, migration-only assets, and compatibility scripts that are no longer needed. Keep the narrow Lead4op payload read bridge only until its own asset inventory reaches zero.
6. **Drop legacy database objects:** in a final reversible migration, drop the legacy view/RPC/table and obsolete grants after backup retention and rollback deadlines are satisfied.

No phase may reintroduce runtime dual-write or implicit legacy fallback. If verification fails, stop the retirement phase, retain the exported rollback data, and fix V2 rather than widening the runtime compatibility boundary.
