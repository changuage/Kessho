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
- Anonymous-auth base REST tables: blocked/empty, status=403
- Detail RPC kessho_get_preset_detail_v2: callable, argument guard reached
- Detail RPC kessho_get_legacy_preset_detail: callable, argument guard reached
- Detail RPC kessho_get_preset_latest_manifest_v2: missing/blocked, PGRST202 not found in schema cache
- Runtime RPC kessho_lookup_preset_rows_v2: callable, no error
- Runtime RPC kessho_get_preset_versions_v2: callable, no error
- Runtime RPC kessho_get_preset_version_ref_keys_v2: callable, no error
- Runtime RPC kessho_get_latest_ref_targets_v2: callable, no error
- Runtime RPC kessho_get_preset_payloads_v2: callable, no error
- Runtime RPC kessho_get_missing_preset_payloads_v2: missing/blocked, PGRST202 not found in schema cache
- Runtime RPC kessho_lookup_preset_id_v2: missing/blocked, PGRST202 not found in schema cache
- Runtime RPC kessho_get_preset_card_v2: missing/blocked, PGRST202 not found in schema cache
- Runtime RPC kessho_exists_preset_logical_key_v2: missing/blocked, PGRST202 not found in schema cache
- Runtime RPC kessho_rename_preset_v2: missing/blocked, PGRST202 not found in schema cache
- Runtime RPC kessho_rename_legacy_preset: missing/blocked, PGRST202 not found in schema cache
- Runtime RPC kessho_find_preset_references_v2: callable, no error
- Runtime RPC kessho_get_preset_storage_stats_v2: callable, no error
- Runtime RPC kessho_save_legacy_preset: callable, argument guard reached
- SQL checks skipped: Missing SUPABASE_DB_URL.
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
$ npm run audit:preset-v2

Supabase preset V2 audit
Mode: limited hardened API
Reason: preset_versions_v2 fetch failed: permission denied for table preset_versions_v2
Visible summaries: 628 V2, 349 legacy
Storage stats RPC: {"bytes":3124853,"count":628,"ref_count":700,"payload_count":1190,"version_count":1034}
RPC issues:
- kessho_lookup_preset_id_v2: missing from hosted schema cache
- kessho_get_preset_card_v2: missing from hosted schema cache
- kessho_exists_preset_logical_key_v2: missing from hosted schema cache
Full table-level integrity, hash, duplicate, and orphan-byte checks require service-role or DB credentials.
```

```text
$ temporary @libpg-query/parser parse supabase/migrations/20260627123656_preset_egress_optimization.sql

SQL parse passed: 53 statements
```

```text
$ npm run audit:supabase-optimization-db-proof

Supabase optimization DB proof skipped: Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.

Coverage note: when a DB URL is available, this audit verifies the optimization migration functions exist, saves the same V2 preset payload twice, asserts a single payload row and stable immediate `last_seen_at`, asserts zero active legacy rows for the test save, verifies narrow id lookup/card/existence/rename RPC behavior, verifies bad hash/body and missing payload hash rejections, verifies purge dry-run is non-mutating, and verifies orphan cleanup deletes a test orphan payload. All mutation checks run inside one transaction and are rolled back.
```

```text
$ npm run audit:supabase-egress:runtime:detail:strict

Blocked until migration is deployed to the live Supabase project:
Error: load-first-preset: found Supabase HTTP 404 response:
/rest/v1/rpc/kessho_get_preset_latest_manifest_v2
```

```text
$ npm run audit:supabase-egress:runtime:detail:repeat

Blocked until migration is deployed to the live Supabase project:
Error: load-first-preset: found Supabase HTTP 404 response:
/rest/v1/rpc/kessho_get_preset_latest_manifest_v2
```

```text
$ npm run maintenance:preset-v2

Blocked by missing service-role credentials:
Preset V2 maintenance reads and mutates wide base tables; set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, or SUPABASE_SECRET_KEY.
```

```text
$ npm run maintenance:preset-v2:postgres

Blocked by missing database URL:
Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.
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

Coverage note: exact canonical strings and SHA-256 outputs remained unchanged after reusing one TextEncoder, replacing the per-call Array.from/map hex encoder with a lookup-loop encoder, reducing canonical object allocation, switching to key-based canonical object traversal, and verifying cache writes hash the already-built canonical JSON text.
```

```text
$ npm run type-check

Generated src/audio/generated/coreProductRuntimeAssetVersion.ts = 61ccb79bc05fd5e9
tsc --noEmit
```

```text
$ npm run audit:supabase-egress

Supabase egress guard passed.

Coverage note: the guard now requires existsV2 to call existsLogicalKeyV2 before the broad queryPresetRowsV2 fallback, requires latest-manifest materialization to pass the payload map directly instead of building synthetic payload rows, and pins the hash/cache helper CPU allocation guard including synchronous cache reads.
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

Supabase optimization DB proof skipped: Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.
```

```text
$ npm run audit:supabase-api-surface
$ npm run audit:preset-v2

Hosted API proof still reports the new latest-manifest, missing-payload, narrow lookup/card/existence, and rename RPCs missing from the schema cache. Full table-level integrity/hash/duplicate/orphan checks still require service-role or DB credentials.
```

```text
$ git diff --check

passed with exit code 0
```

### Metrics

| Metric | Before | After | Target |
|---|---:|---:|---:|
| Fresh cloud/preset UI Supabase bytes | 15.9 KB | 16.4 KB and under budget | lower than before and under configured budget |
| Open first preset detail bytes | 288.0 KB | not verified on live DB; latest RPC 404 until migration deploy | lower than before for latest-only path |
| Repeat-open same preset detail bytes | not measured | local fake-client regression proves repeat default load avoids the payload RPC after cache warmup; strict browser repeat audit is wired as `audit:supabase-egress:runtime:detail:repeat` and is pending migration deploy | near metadata-only when payload cache is warm |
| Default cloud list row count pulled | 200 on preset_summaries_v2 runtime path | 50 on preset_summaries_v2 runtime path; cloud browser page size 24 | <= page size |
| Search row count pulled | not measured | static guard enforces search page size 20; page cache stores exact next cursor and plays cursors include null-play rows | <= search page size |
| Duplicate cloud save payload rows created | not measured | static/client contract writes V2 payload hashes; live DB proof pending migration/test credentials | 0 new payload rows for identical body/hash |
| Duplicate cloud save payload bytes created | not measured | duplicate payload SQL uses stale-only last_seen_at update; live DB proof pending migration/test credentials | 0 new payload bytes for identical body/hash |
| Bad payload hash/body rejection | not measured | optimization migration now verifies canonical JSON hashes server-side and contains fixed valid + invalid SQL self-tests, including negative rounding parity; execution proof pending DB access | bad hash/body pair rejected before storage |
| Missing version/ref payload hashes | not measured | optimization migration rejects non-null version/ref payload hashes absent from `preset_payloads_v2`; execution proof pending DB access | no persisted version/ref points at a missing payload body |
| Direct browser base-table payload pulls | 0 observed in runtime egress audit | 0 runtime/browser-maintenance base-table touchpoints in revoke audit; optimization RPC migration explicitly revokes broad execute from helper/private functions and grants only intended authenticated/service-role RPCs | 0 |
| `select('*')` or bare `.select()` in Supabase paths | 2 static failures | 0 static failures | 0 |
| Orphan payload bytes after cleanup | not measured | purge and maintenance SQL added; execution proof pending service/database credentials | lower or 0 in seeded test |

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
- Preset hash/cache helpers now reuse a module-level `TextEncoder`, use a precomputed hex-byte lookup loop for SHA-256 digest encoding, build canonical objects without `Object.entries` tuple/filter allocation in the storage hash hot path, hash already-built canonical JSON text during cache writes, and read payload cache entries synchronously while scanning hashes.
- Phase 7 narrow lookup RPCs were added for id lookup, preset card fetch, and logical-key existence checks. Public cloud save preflight now prefers `kessho_lookup_preset_id_v2` + `kessho_get_preset_card_v2` and keeps the broader row lookup only as a pre-migration compatibility fallback.
- V2 existence checks now prefer `kessho_exists_preset_logical_key_v2`; regression and static guards assert the narrow logical-key RPC runs before any broad row lookup fallback.
- V2 rename now uses `kessho_lookup_preset_id_v2` plus the narrow rename RPC and skips the previous broad target/conflict row preflight. The soft-delete/rename regression asserts no `kessho_lookup_preset_rows_v2` call is added by the happy-path rename.
- Narrow rename RPCs replacing `update(...).select('*')`.
- Rollback-only DB proof now verifies narrow id lookup, preset card, logical-key existence, and rename RPC behavior once DB credentials are available.
- Duplicate payload conflict behavior changed to stale-only `last_seen_at` updates in the new migration.
- Retention-based V2 purge function with dry-run, advisory lock, bounded batches, and orphan payload cleanup.
- Client session debounce for play-count increments.
- Static guard coverage for the play-count debounce contract.
- Runtime egress audit coverage now treats `--reload-count` plus `--load-first-preset` as repeated first-preset detail loads and enforces the detail byte budget on that average.
- Static egress guard coverage now pins the repeat-detail runtime audit script and its reload-plus-load behavior.
- `audit:preset-v2` now supports hardened hosted projects by falling back to summary-view and narrow-RPC evidence when service-role credentials are absent; full table-level integrity checks still run when a service key is available.
- Static egress guard coverage now proves new V2 cloud presets use the latest-manifest read-by-id path and existing legacy presets remain readable through the narrow legacy detail fallback.
- Rollback-only DB proof runner added for duplicate-save payload rows/bytes, stale-only conflict behavior, bad hash rejection, missing hash rejection, purge dry-run, and orphan cleanup once a DB URL is available.

### Guide Checklist Status

Local code and static/runtime guards satisfy the guide items for V2 cloud saves, removal of the public legacy save path, compact browse/search/featured projections, pagination, latest-only default detail loads, payload-by-hash caching, no browser `select('*')`, runtime/browser base-table read readiness, soft-delete regression coverage, Node plus browser hash golden vectors, server-side hash verification SQL, stale-only duplicate payload conflicts, narrow id/card/existence and rename RPCs, bounded purge SQL, advisory locking, play-count debounce coverage, and a repeat-detail runtime audit path.

The remaining checklist proof requires applying `supabase/migrations/20260627123656_preset_egress_optimization.sql` to a local/staging/live Supabase database and rerunning DB-backed assertions. `npm run audit:supabase-optimization-db-proof` now covers duplicate payload row/byte counts, no new active legacy row, stale-only duplicate update behavior, narrow lookup/card/existence/rename RPC execution, purge dry-run/execution/orphan cleanup counts, bad hash rejection execution, and missing payload hash rejection execution inside a rolled-back transaction once `DATABASE_URL`, `SUPABASE_DATABASE_URL`, or `SUPABASE_DB_URL` is set. Remaining live-browser proof still requires strict single-detail and repeat-detail egress bytes after `kessho_get_preset_latest_manifest_v2` is present in the hosted schema cache. Hosted API proof also requires the new `kessho_get_missing_preset_payloads_v2`, `kessho_lookup_preset_id_v2`, `kessho_get_preset_card_v2`, `kessho_exists_preset_logical_key_v2`, and rename RPCs to be present, plus full table-level V2 integrity/hash/orphan audit with service-role or DB credentials.
