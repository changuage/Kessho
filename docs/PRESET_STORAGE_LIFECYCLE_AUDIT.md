# Preset Storage Lifecycle Audit

## Status

Completed on 2026-07-13 against the application code and live Supabase database. Confirmed lifecycle defects were repaired, the migration was applied, expired recycle-bin data was purged, and the strengthened integrity, security, API-surface, egress, and regression gates pass.

## Scope

The audit traced the V2 preset lifecycle end to end:

- graph-authoritative and snapshot save/load paths;
- named child refs and direct content refs;
- soft delete, restore, hard purge, and internal-derived garbage collection;
- version ancestry and patch/checkpoint retention;
- payload reachability and deletion;
- family-group integrity;
- RLS, RPC grants, Data API exposure, and runtime egress;
- scheduled maintenance and manual maintenance scripts.

## Confirmed Defects

### 1. Soft delete could make a preset impossible to restore

The old internal-derived garbage collector protected only graphs rooted at active visible presets. Soft deleting a root therefore recycled hidden descendants still referenced by the retained root history. Restore revived only the root, leaving its graph incomplete.

Four live recycled roots had this restore hazard before repair.

### 2. Coordinated maintenance could delete live direct-content payloads

The maintenance function counted named preset refs but not `preset_version_content_refs_v2`. Running it could classify payloads referenced only by graph-authoritative content refs as unreferenced and delete them.

The scheduled job was missing, which prevented this defect from executing automatically but also left retention and garbage collection unscheduled.

### 3. Hard purge could corrupt surviving version ancestry

The old purge function deleted historical owner versions to break incoming references. Foreign-key `ON DELETE SET NULL` then left surviving patch versions without a parent, making the patch chain incomplete. Nine live patch roots were already in this state.

### 4. Existing audits did not cover retained graph reachability

The old checks were direct-reference based and could not distinguish:

- a valid hidden node retained by an active or recycled visible root;
- a deleted hidden dependency that made restore unsafe;
- a true hidden orphan outside every retained visible graph.

They also did not block on orphan patch roots, missing lifecycle configuration, parentless families, or unreferenced payloads.

## Repairs

Migration `20260713205616_preset_graph_lifecycle_integrity_v2.sql` makes lifecycle decisions from recursive retained-root reachability:

- soft delete preserves the complete graph of every retained visible root;
- restore recursively revives internal-derived descendants in one transaction;
- restore fails closed when an independently visible deleted dependency must be restored separately;
- hard purge no longer deletes historical versions merely to break incoming refs;
- a surviving patch version whose parent is deleted is atomically rebased to a checkpoint;
- direct content refs are payload reachability roots during maintenance;
- hard deletion reruns hidden-node garbage collection;
- one lifecycle maintenance job runs on the 1st and 16th of each month;
- lifecycle RPC execution is restricted to the intended roles.

The JavaScript and PostgreSQL maintenance scripts now use the same retained-root traversal, including deleted intermediate nodes. This prevents manual maintenance from recreating the restore defect.

The live repair reactivated or rewired retained hidden descendants, converted orphan patch roots to valid checkpoints, and installed the maintenance schedule.

## Production Cleanup

Before cleanup, the live corpus had 1,167 presets, 1,636 versions, 1,778 named refs, 45 direct content refs, and 1,906 payloads.

Bounded purge passes removed 45 expired presets, 57 versions, 70 named refs, and 42 payloads totaling 61,718 bytes. Content-aware maintenance removed six additional obsolete patch payloads. Direct content refs remained unchanged.

Final live state:

| Check | Result |
|---|---:|
| Presets | 1,122 |
| Versions | 1,579 |
| Named refs | 1,708 |
| Direct content refs | 45 |
| Payloads | 1,858 |
| Unreferenced payload bytes | 0 B |
| Active hidden nodes outside all retained graphs | 0 |
| Recycled-root restore hazards | 0 |
| Orphan patch roots | 0 |
| Active families without a parent | 0 |
| Active lifecycle cron jobs | 1 |
| Blocking integrity issues | 0 |

There are 22 active hidden rows retained exclusively by recycled visible roots. They are intentional restore dependencies, not orphans. There are also 142 recycled rows with retained incoming references; purge correctly preserves them until their owners are removed or references expire.

## Regression Coverage

`run-preset-lifecycle-db-regression.mjs` executes in a rollback transaction and covers:

- hidden graph retention across soft delete;
- recursive root and descendant restore;
- failure on deleted independently visible dependencies;
- collection of a true hidden orphan;
- patch-to-checkpoint rebasing after parent deletion;
- survival of content-only payloads during maintenance;
- hidden child collection after an expired root is purged;
- preservation of historical versions by purge;
- direct-content reachability in maintenance;
- exactly one installed lifecycle schedule.

The in-memory soft-delete regression now models retained-root graph semantics and verifies restore followed by hard-purge collection.

## Verification

The following gates pass after the production migration and cleanup:

```bash
npm run type-check
npm run test:preset-soft-delete
npm run test:preset-lifecycle-db
npm run test:preset-content-refs-db
npm run test:preset-graph-authority
npm run test:preset-exact-load
npm run test:preset-dedup
npm run test:preset-content-ownership
npm run test:preset-content-nodes
npm run test:preset-shared-component-pools
npm run test:preset-sequencer-components
npm run test:preset-hash-golden
npm run audit:preset-v2 -- --fail-on-issues
npm run audit:supabase-security
npm run audit:supabase-egress
npm run audit:supabase-api-surface
npm run audit:supabase-egress:runtime:detail:repeat
```

The runtime egress gate measured 15.3 KB for initial load, no request when opening the library, 98.1 KB for first preset detail, and 28.3 KB average on repeated detail loads. No Supabase errors occurred.

A production graph restore and re-delete smoke test also passed inside a rolled-back transaction.

## Residual Nonblocking Work

The audit reports 468 historical versions without `resolved_hash`. They are not integrity failures: graph-authoritative versions intentionally omit the resolved snapshot, and legacy versions remain readable. Maintenance can materialize 469 caches, but doing so would increase storage without improving graph correctness, so no bulk cache backfill was performed.

A pre-migration backup of all five V2 tables is recorded at `backups/supabase-preset-v2-postgres-2026-07-13T21-08-06-537Z/manifest.json`.
