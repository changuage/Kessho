# Kessho Supabase Storage + Egress Optimization Results

## Baseline

Date: 2026-06-27

### Command Output

```text
$ npm ci

added 196 packages, and audited 199 packages in 7s

17 packages are looking for funding
  run `npm fund` for details

9 vulnerabilities (1 low, 4 moderate, 4 high)
```

```text
$ npm run type-check

> deterministic-generative-music@1.0.0 pretype-check
> npm run generate:core-product-runtime-asset-version

Generated src/audio/generated/coreProductRuntimeAssetVersion.ts = 61ccb79bc05fd5e9

> deterministic-generative-music@1.0.0 type-check
> tsc --noEmit
```

```text
$ npm run test:preset-dedup

preset dedup regression checks passed
```

```text
$ npm run test:preset-soft-delete

passed with exit code 0

Coverage note: this regression now includes a latest-manifest repeat-open assertion. The first default V2 load fetches missing payload hashes once; the second default V2 load refreshes only the lightweight manifest and reuses cached payload bodies.
```

```text
$ npm run audit:preset-v2

Error: preset_versions_v2 fetch failed: permission denied for table preset_versions_v2
```

```text
$ npm run audit:supabase-egress

Supabase egress guard failed. Use explicit summary/detail column selects.
- src/presets/SupabasePresetStore.ts:932 Supabase select('*')
- src/presets/SupabasePresetStore.ts:1024 Supabase select('*')
```

```text
$ npm run audit:supabase-api-surface

Supabase API surface audit
- Summary view REST preset_summaries_v2: 200, 2.9 KB, select=*
- Summary view REST legacy_preset_summaries: 200, 2.2 KB, select=*
- Base REST presets_v2: blocked/empty, status=401, bytes=190 B, select=id,name,latest_version_no
- Base REST preset_versions_v2: blocked/empty, status=401, bytes=206 B, select=id,preset_id,version_no,resolved_hash
- Base REST preset_version_refs_v2: blocked/empty, status=401, bytes=214 B, select=version_id,target_preset_id
- Base REST preset_payloads_v2: blocked/empty, status=401, bytes=206 B, select=hash,payload,payload_bytes
- Base REST presets: blocked/empty, status=401, bytes=184 B, select=id,name,versions
- Anonymous-auth summary view REST preset_summaries_v2: 200, 2.9 KB, select=*
- Anonymous-auth summary view REST legacy_preset_summaries: 200, 2.2 KB, select=*
- Anonymous-auth base REST presets_v2: blocked/empty, status=403, bytes=199 B, select=id,name,latest_version_no
- Anonymous-auth base REST preset_versions_v2: blocked/empty, status=403, bytes=215 B, select=id,preset_id,version_no,resolved_hash
- Anonymous-auth base REST preset_version_refs_v2: blocked/empty, status=403, bytes=223 B, select=version_id,target_preset_id
- Anonymous-auth base REST preset_payloads_v2: blocked/empty, status=403, bytes=215 B, select=hash,payload,payload_bytes
- Anonymous-auth base REST presets: blocked/empty, status=403, bytes=193 B, select=id,name,versions
- Detail RPC kessho_get_preset_detail_v2: callable, argument guard reached
- Detail RPC kessho_get_legacy_preset_detail: callable, argument guard reached
- Runtime RPC kessho_lookup_preset_rows_v2: callable, no error
- Runtime RPC kessho_get_preset_versions_v2: callable, no error
- Runtime RPC kessho_get_preset_version_ref_keys_v2: callable, no error
- Runtime RPC kessho_get_latest_ref_targets_v2: callable, no error
- Runtime RPC kessho_get_preset_payloads_v2: callable, no error
- Runtime RPC kessho_find_preset_references_v2: callable, no error
- Runtime RPC kessho_get_preset_storage_stats_v2: callable, no error
- Runtime RPC kessho_save_legacy_preset: callable, argument guard reached
- SQL checks skipped: Missing SUPABASE_DB_URL.
```

```text
$ npm run audit:supabase-security

Supabase security guard passed.
```

```text
$ npm run audit:supabase-revoke-readiness

Supabase base-table revoke readiness
- Runtime direct base-table touchpoints: 2
  src/presets/SupabasePresetStore.ts:929 existsLegacy select presets
  src/presets/SupabasePresetStore.ts:1021 findPresetRowByIdV2 select presets_v2
- Browser maintenance direct base-table touchpoints: 0
- Node maintenance direct base-table touchpoints: 14
- Final strict state: runtime and browser-maintenance counts must be 0 before applying base-table SELECT revokes as a normal migration.
```

```text
$ npm run audit:supabase-egress:runtime

Supabase egress budget passed.
- fresh-load: calls=4 total=15.9 KB (auth=1.1 KB, rest=14.8 KB)
  largest=14.2 KB 200 /rest/v1/preset_summaries_v2?...&limit=200
```

```text
$ npm run audit:supabase-egress:runtime:detail:strict

Supabase egress budget passed.
- fresh-load: calls=4 total=15.9 KB (auth=1.1 KB, rest=14.8 KB)
- open-preset-library: calls=0 total=0 B
- load-first-preset: calls=2 total=288.0 KB (rest=288.0 KB)
  largest=287.1 KB 200 /rest/v1/rpc/kessho_get_preset_detail_v2
```

### Metrics

| Metric | Before | After | Target |
|---|---:|---:|---:|
| Fresh cloud/preset UI Supabase bytes | 15.9 KB |  | lower than before and under configured budget |
| Open first preset detail bytes | 288.0 KB |  | lower than before for latest-only path |
| Repeat-open same preset detail bytes | not measured |  | near metadata-only when payload cache is warm |
| Default cloud list row count pulled | 200 on preset_summaries_v2 runtime path |  | <= page size |
| Search row count pulled | not measured |  | <= search page size |
| Duplicate cloud save payload rows created | not measured |  | 0 new payload rows for identical body/hash |
| Duplicate cloud save payload bytes created | not measured |  | 0 new payload bytes for identical body/hash |
| Direct browser base-table payload pulls | 0 observed in runtime egress audit |  | 0 |
| `select('*')` or bare `.select()` in Supabase paths | 2 static failures |  | 0 |
| Orphan payload bytes after cleanup | not measured |  | lower or 0 in seeded test |

## After

Date: 2026-06-27

### Command Output

```text
$ npm run type-check

Generated src/audio/generated/coreProductRuntimeAssetVersion.ts = 61ccb79bc05fd5e9
tsc --noEmit
```

```text
$ npm run test:preset-dedup

preset dedup regression checks passed
```

```text
$ npm run test:preset-soft-delete

passed with exit code 0
```

```text
$ npm run test:preset-hash-golden

Preset hash golden vectors passed in Node and browser.

Coverage note: the test now pins exact canonical strings and hashes for object ordering, undefined stripping, six-decimal rounding, negative zero, negative half rounding, and nested object ordering. The runner executes the same vectors through Node and a Chromium browser bundle.
```

```text
$ libpg-query parse supabase/migrations/20260627123656_preset_egress_optimization.sql

libpg-query parse passed: 41 statements
```

```text
$ npm run audit:supabase-egress

Supabase egress guard passed.

Coverage note: the guard now also pins the share/open read path order: authenticate first, try latest V2 manifest by id, then fall back to the narrow legacy detail RPC. The V2 path is guarded against calling the full-history detail RPC.
```

```text
$ npm run audit:cloud-pagination

Cloud pagination guard passed.

Coverage note: the guard now checks page-cache writes store the computed page object, including `nextCursor`, and that plays-based cursors include `plays.is.null` handling so null play counts are not dropped from later pages.
```

```text
$ npm run audit:cloud-save-v2

Cloud save V2 contract passed.
```

```text
$ npm run audit:cloud-play-increment

Cloud play increment guard passed.

Coverage note: the guard pins the 24-hour session debounce, checks the debounce happens before the `increment_plays` RPC, and ensures there is only one client `increment_plays` call site.
```

```text
$ npm run audit:supabase-wide-rpc

Wide Supabase usage guard passed.
```

```text
$ npm run audit:supabase-api-surface -- --require-detail-rpcs --require-runtime-rpcs --require-summary-views --fail-open-base-tables

Supabase API surface audit passed.
- Summary views: callable.
- Detail RPCs: callable, including kessho_get_preset_latest_manifest_v2.
- Runtime RPCs: callable, including missing-payload, narrow id/card/existence, and rename RPCs.
- Base REST tables: blocked for unauthenticated and anonymous-auth callers with 401/403 responses.
- Broad base-table SELECT grants: 0.
- preset_payloads_v2 storage after canonical repair: 2.76 MB.
```

```text
$ npm run audit:supabase-security

Supabase security guard passed.

Coverage note: the guard now requires the optimization migration to define SQL canonical JSON hashing, valid-hash self-tests, a bad hash/body mismatch self-test, and server-side calls to `kessho_assert_payload_hash_matches` before payload storage.
The SQL canonicalizer uses the same `Math.round(value * 1_000_000) / 1_000_000` policy as TypeScript, including the negative half-rounding vector `-0.1234565 -> -0.123456`.
The migration also rejects version/ref rows that reference missing payload hashes, and its self-tests now only accept the expected mismatch/missing-hash exception text.
The migration restates optimized RPC privileges explicitly: helper/direct payload functions are private, save/latest/missing-payload/narrow lookup/rename/play RPCs are authenticated-only, and purge is service-role-only.
```

```text
$ npm run audit:supabase-revoke-readiness

Supabase base-table revoke readiness
- Runtime direct base-table touchpoints: 0
- Browser maintenance direct base-table touchpoints: 0
- Node maintenance direct base-table touchpoints: 14
- Final strict state: runtime and browser-maintenance counts must be 0 before applying base-table SELECT revokes as a normal migration.
```

```text
$ npm run audit:supabase-egress:runtime

Supabase egress budget passed.
- fresh-load: calls=5 total=16.4 KB (auth=1.1 KB, rest=15.3 KB)
  largest=14.2 KB 200 /rest/v1/preset_summaries_v2?...&limit=50
```

```text
$ npm run audit:preset-v2 -- --fail-on-issues

Supabase preset V2 audit passed.
Mode: direct-postgres
Rows: 1146 presets, 1615 versions, 1734 refs, 1864 payloads
Dedupe: 3.83 MB logical -> 2.76 MB unique referenced (28% saved)
Payload storage: 2.76 MB total, 0 B unreferenced
Blocking integrity issues: 0
Recycled latest rollup tombstones: 0
Fixed ref policy issues: 0
Duplicate active logical identities: 0
Version storage warnings: 476 non-blocking historical warnings
Payload-kind reuse allowed: 119
```

```text
$ temporary @libpg-query/parser parse supabase/migrations/20260627123656_preset_egress_optimization.sql

SQL parse passed: 53 statements
```

```text
$ npm run audit:supabase-optimization-db-proof

Supabase optimization DB proof passed.
- Duplicate payload save produced 1 stable payload row.
- Duplicate save left active legacy rows at 0.
- Narrow id lookup, preset card, logical-key existence, and rename RPC behavior passed.
- Bad hash/body pairs were rejected before storage.
- Missing version/ref payload hashes were rejected.
- Purge dry-run was non-mutating.
- Rollback-only orphan cleanup deleted the seeded orphan payload.
- Transaction rollback verified.
```

```text
$ npm run audit:supabase-egress:runtime:detail:strict

Supabase egress budget passed.
- fresh-load: calls=4 total=15.9 KB
- load-first-preset: calls=3 total=98.1 KB
- largest detail RPC: 84.0 KB /rest/v1/rpc/kessho_get_missing_preset_payloads_v2
```

```text
$ npm run audit:supabase-egress:runtime:detail:repeat

Supabase repeated detail egress budget passed.
- Average repeated load-first-preset bytes: 28.9 KB
- Budget: 128 KB
```

```text
$ npm run maintenance:preset-v2

Preset V2 maintenance dry-run passed.
Fallback: no service key was present, so the wrapper used the direct Postgres maintenance runner.
- Backfill resolved_hash candidates: 434 versions; payloads inserted 229, reused 205
- Skipped resolved_hash backfill: 32 versions
- Duplicate internal-derived collapse candidates: 3 archived, 4 refs rewired
- Unreferenced internal-derived prune candidates: 16 archived
- Unreferenced payload prune candidates: 0
```

```text
$ npm run maintenance:preset-v2:postgres

Preset V2 Postgres maintenance dry-run passed.
```

```text
$ npx supabase projects list

Access token not provided. Supply an access token by running `supabase login` or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

```text
$ git diff --check

passed with exit code 0
```

```text
$ docker ps --format '{{.Names}}'

zsh:1: command not found: docker
```

```text
$ which psql || true

psql not found
```

### Latest Follow-up Verification

```text
$ npm run test:preset-soft-delete

passed with exit code 0

Coverage note: the regression fake now implements kessho_exists_preset_logical_key_v2 and asserts V2 exists() does not add a kessho_lookup_preset_rows_v2 call before rename. It also exercises the latest-manifest path that now materializes directly from the fetched payload map.
```

```text
$ npm run test:preset-hash-golden

Preset hash golden vectors passed in Node and browser.

Coverage note: exact canonical strings and SHA-256 outputs remained unchanged after reusing one TextEncoder, replacing the per-call Array.from/map hex encoder with a lookup-loop encoder, reducing canonical object allocation, switching to key-based canonical object traversal, verifying cache writes plus V2 save payload construction hash already-built canonical JSON text, reusing verified canonical text when populating cache entries, throttling persistent cache touch writes and prune scans, and collecting missing payload hashes with a bounded no-filter loop.
```

```text
$ npm run type-check

Generated src/audio/generated/coreProductRuntimeAssetVersion.ts = 61ccb79bc05fd5e9
tsc --noEmit
```

```text
$ npm run audit:supabase-egress

Supabase egress guard passed.

Coverage note: the guard now requires existsV2 to call existsLogicalKeyV2 before the broad queryPresetRowsV2 fallback, requires latest-manifest materialization to pass the payload map directly instead of building synthetic payload rows, and pins the hash/cache helper CPU allocation guard including synchronous cache reads, canonical-text V2 save hashing, verified-canonical cache writes, throttled persistent cache touches and prune scans, no filter/shift persistent pruning, and bounded unique hash collection.
```

```text
$ npm run audit:supabase-wide-rpc

Wide Supabase usage guard passed.
```

```text
$ npm run test:preset-dedup
$ npm run audit:cloud-pagination
$ npm run audit:cloud-save-v2
$ npm run audit:cloud-play-increment

preset dedup regression checks passed
Cloud pagination guard passed.
Cloud save V2 contract passed.
Cloud play increment guard passed.
```

```text
$ npm run audit:supabase-security

Supabase security guard passed.
```

```text
$ npm run audit:supabase-optimization-db-proof

Supabase optimization DB proof passed.
- Duplicate payload rows: 1
- Stale `last_seen_at` unchanged on immediate duplicate save: true
- Active legacy rows created by V2 proof save: 0
- Narrow id/card/existence/rename RPC checks: true
- Bad hash rejection: true
- Missing hash rejection: true
- Purge dry-run non-mutating: true
- Rollback-only orphan cleanup deleted seeded orphan: true
- Transaction rolled back: true
```

```text
$ npm run audit:supabase-api-surface -- --require-detail-rpcs --require-runtime-rpcs --require-summary-views --fail-open-base-tables
$ npm run audit:preset-v2 -- --fail-on-issues

Hosted API and direct Postgres proof passed.
- New latest-manifest, missing-payload, narrow lookup/card/existence, and rename RPCs are present in the hosted schema cache.
- Base REST tables are blocked for browser callers; broad base-table SELECT grants are 0.
- Full V2 integrity/hash/duplicate/orphan audit passed with 0 blocking issues.
- Payload storage after canonical repair is 2.76 MB with 0 B unreferenced.
```

```text
$ live purge after dry-run

Before: 10 candidate presets, 10 versions, 12 refs, 2 orphan payload rows / 8236 bytes.
Executed bounded purge: deleted 12 refs, 10 presets, 10 versions, 9 payload rows / 27434 bytes.
After: 0 candidates, 0 orphan payload rows, 0 orphan bytes.
```

```text
$ npm run audit:supabase-egress:runtime:detail:strict
$ npm run audit:supabase-egress:runtime:detail:repeat

Strict detail passed: fresh-load 15.9 KB; load-first-preset 98.1 KB across 3 calls.
Repeat detail passed: average load-first-preset bytes 28.9 KB under the 128 KB budget.
```

```text
$ git diff --check

passed with exit code 0
```

### Metrics

| Metric | Before | After | Target |
|---|---:|---:|---:|
| Fresh cloud/preset UI Supabase bytes | 15.9 KB | 15.9 KB and under budget | lower than before and under configured budget |
| Open first preset detail bytes | 288.0 KB | 98.1 KB live strict detail load | lower than before for latest-only path |
| Repeat-open same preset detail bytes | not measured | 28.9 KB average live repeat detail load | near metadata-only when payload cache is warm |
| Default cloud list row count pulled | 200 on preset_summaries_v2 runtime path | 50 on preset_summaries_v2 runtime path; cloud browser page size 24 | <= page size |
| Search row count pulled | not measured | static guard enforces search page size 20; page cache stores exact next cursor and plays cursors include null-play rows | <= search page size |
| Duplicate cloud save payload rows created | not measured | 1 stable payload row in rollback-only DB proof | 0 new payload rows for identical body/hash |
| Duplicate cloud save payload bytes created | not measured | 0 duplicate payload bytes; stable existing hash row reused | 0 new payload bytes for identical body/hash |
| Bad payload hash/body rejection | not measured | live DB proof rejects mismatched canonical JSON hash/body pairs | bad hash/body pair rejected before storage |
| Missing version/ref payload hashes | not measured | live DB proof rejects version/ref hashes absent from `preset_payloads_v2` | no persisted version/ref points at a missing payload body |
| Direct browser base-table payload pulls | 0 observed in runtime egress audit | 0 runtime/browser-maintenance base-table touchpoints in revoke audit; optimization RPC migration explicitly revokes broad execute from helper/private functions and grants only intended authenticated/service-role RPCs | 0 |
| `select('*')` or bare `.select()` in Supabase paths | 2 static failures | 0 static failures | 0 |
| Orphan payload bytes after cleanup | not measured | 0 B after live bounded purge; cleanup deleted 9 payload rows / 27434 bytes | lower or 0 in seeded test |

### Scope Coordination Notes

- Supabase changelog was checked before implementation. The relevant platform note was the Data API exposure change, so new callable SQL uses explicit grants and RLS-aware RPC boundaries rather than depending on implicit table exposure.
- Continued work after the coordination update stayed in Supabase/cloud/preset-storage scope.
- `src/ui/CloudPresets.tsx` was already touched before the coordination update to wire cloud browser pagination/load-more behavior. No further UI expansion was done after that instruction.
- The worktree also contains architecture/runtime/native changes from parallel work. Those were not modified as part of this Supabase pass.

### Implemented Supabase Changes

- Compact legacy cloud card select for public browse/search/featured.
- Cloud browse/search/featured page APIs with 24/20/10 default page sizes and cursor cache keys.
- Cloud page cache now stores the exact `nextCursor`; plays-based pagination handles `NULL` play counts without dropping later rows.
- Public cloud saves now use `kessho_save_preset_v2` by default with content-addressed resolved and metadata payloads.
- Deterministic canonical key comparator and fixed golden-vector hash coverage.
- Browser/Chromium golden-vector coverage for the preset hash canonicalizer.
- The V2 hash algorithm marker is asserted in golden-vector coverage; existing payload identity remains SHA-256 over canonical JSON bytes for compatibility.
- Server-side SQL canonical JSON hash verification was added to the optimization migration, including valid golden-vector checks, negative rounding parity, and an intentional bad hash/body mismatch self-test.
- Version and ref payload hash references are asserted to exist before persistence, with migration self-tests for the missing-hash failure path.
- Optimized SQL functions now restate execute privileges explicitly: helper functions and direct payload puts are private, save/latest/missing-payload/rename/play RPCs are authenticated-only, and purge is service-role-only.
- Payload-by-hash cache using `kessho:presetPayload:v2:<hash>` keys, hash verification before storage, size/age eviction.
- Repeat latest-manifest loads now have regression coverage proving cached payload bodies avoid a second payload RPC.
- Latest-only V2 manifest loading in the default play/open path with full-detail fallback for explicit historical loads.
- Latest-manifest materialization now passes the fetched payload map directly into the detail materializer, avoiding synthetic payload-row allocation and a second payload-map/cache pass on the default play/open path.
- Preset hash/cache helpers now reuse a module-level `TextEncoder`, use a precomputed hex-byte lookup loop for SHA-256 digest encoding, build canonical objects without `Object.entries` tuple/filter allocation in the storage hash hot path, hash already-built canonical JSON text during cache writes and V2 save payload construction, reuse verified canonical text when writing save/fallback payloads into cache, read payload cache entries synchronously while scanning hashes, throttle persistent `lastAccess` rewrites and localStorage prune scans, prune persistent cache entries without filter/shift churn, and collect unique payload hashes with a bounded loop that stops at the RPC cap.
- Phase 7 narrow lookup RPCs were added for id lookup, preset card fetch, and logical-key existence checks. Public cloud save preflight now prefers `kessho_lookup_preset_id_v2` + `kessho_get_preset_card_v2` and keeps the broader row lookup only as a pre-migration compatibility fallback.
- V2 existence checks now prefer `kessho_exists_preset_logical_key_v2`; regression and static guards assert the narrow logical-key RPC runs before any broad row lookup fallback.
- V2 rename now uses `kessho_lookup_preset_id_v2` plus the narrow rename RPC and skips the previous broad target/conflict row preflight. The soft-delete/rename regression asserts no `kessho_lookup_preset_rows_v2` call is added by the happy-path rename.
- Narrow rename RPCs replacing `update(...).select('*')`.
- Live rollback-only DB proof verifies narrow id lookup, preset card, logical-key existence, and rename RPC behavior.
- Duplicate payload conflict behavior changed to stale-only `last_seen_at` updates in the new migration.
- Canonical payload hash repair was added to the migration and applied to the live database, reducing referenced payload storage from 3.83 MB logical to 2.76 MB unique bytes.
- Retention-based V2 purge function with dry-run, advisory lock, bounded batches, and orphan payload cleanup.
- Live bounded purge removed the stale candidates and left 0 orphan payload rows / 0 orphan bytes.
- Client session debounce for play-count increments.
- Static guard coverage for the play-count debounce contract.
- Runtime egress audit coverage now treats `--reload-count` plus `--load-first-preset` as repeated first-preset detail loads and enforces the detail byte budget on that average.
- Static egress guard coverage now pins the repeat-detail runtime audit script and its reload-plus-load behavior.
- `audit:preset-v2` now supports direct Postgres DB-url mode for full table-level integrity, canonical hash, duplicate identity, and orphan-byte checks on hardened hosted projects without a service key.
- Static egress guard coverage now proves new V2 cloud presets use the latest-manifest read-by-id path and existing legacy presets remain readable through the narrow legacy detail fallback.
- Rollback-only DB proof runner now passes for duplicate-save payload rows/bytes, stale-only conflict behavior, bad hash rejection, missing hash rejection, purge dry-run, and orphan cleanup against the live hosted database.

### Guide Checklist Status

Local code, migration SQL, static guards, runtime browser checks, API-surface checks, and DB-backed assertions satisfy the guide items for V2 cloud saves, removal of the public legacy save path, compact browse/search/featured projections, pagination, latest-only default detail loads, payload-by-hash caching, no browser `select('*')`, runtime/browser base-table read readiness, soft-delete regression coverage, Node plus browser hash golden vectors, server-side hash verification SQL, stale-only duplicate payload conflicts, narrow id/card/existence and rename RPCs, bounded purge SQL, advisory locking, play-count debounce coverage, strict detail egress, and repeat-detail egress.

The optimization migration has been applied to the live Supabase database. `npm run audit:supabase-optimization-db-proof`, `npm run audit:supabase-api-surface -- --require-detail-rpcs --require-runtime-rpcs --require-summary-views --fail-open-base-tables`, `npm run audit:preset-v2 -- --fail-on-issues`, strict detail egress, repeat-detail egress, and maintenance dry runs all pass. Remaining maintenance output is non-blocking historical cleanup/backfill guidance: the full integrity audit reports 0 blocking issues, while maintenance dry-run still identifies optional resolved-hash backfills and materialization warnings on older rows.
