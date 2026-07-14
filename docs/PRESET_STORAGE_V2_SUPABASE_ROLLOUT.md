# Preset Storage V2 Supabase Rollout

## Direct Content Refs

The 2026-07-12 content-hash rollout adds `preset_version_content_refs_v2` and a five-argument `kessho_save_preset_v2` overload. Direct refs are parent-authorized, browser table access is revoked, and every save supplies canonical content bytes to prevent hash-existence probing. New L4 versions are graph-authoritative with `resolved_hash = null`; legacy versions retain their existing readers. See [PRESET_CONTENT_HASH_IMPLEMENTATION_REPORT.md](./PRESET_CONTENT_HASH_IMPLEMENTATION_REPORT.md).

This runbook follows the V2 fix plan in `/Users/panguroo/Downloads/kessho_preset_storage_v2_fix_plan.md`.

## Current local export

The current Free-plan logical export was written locally on 2026-05-28:

```text
backups/supabase-public-20260528-003718/
```

It includes `schema.sql`, `data.sql`, `metadata.json`, and per-table JSON exports for the public preset tables.

This is a public-schema export made through the Postgres pooler because the official Supabase CLI `db dump` path requires Docker or local `pg_dump` on this machine.

## 2026-05-28 Production Application

Applied:

```text
supabase/migrations/20260528004000_preset_storage_v2_policy_alignment.sql
supabase/migrations/20260528011500_preset_storage_v2_atomic_save_rpc.sql
supabase/migrations/20260528014500_preset_storage_v2_maintenance_cron.sql
```

Production maintenance then reported:

```text
refs_converted: 0
historical_resolved_caches_cleared: 231
orphan_payloads_deleted: 55
```

Post-cleanup dry run:

```text
fixed_refs_to_convert: 0
historical_resolved_cache_rows: 0
historical_resolved_cache_bytes: 0
orphan_payload_rows: 0
orphan_payload_bytes: 0
duplicate_active_logical_identity_groups: 0
```

Post-cleanup audit:

```text
blocking integrity issues: 0
fixed ref policy issues: 0
duplicate active logical identities: 0
removable historical resolved cache: 0 B
payload storage: 2.26 MB
```

The atomic save RPC is installed as `public.kessho_save_preset_v2(...)`. It is intended to be called through Supabase Auth; direct pooler SQL sessions have `auth.uid() is null` and cannot exercise the authenticated write path.

The coordinated maintenance cron is active:

```text
jobname: kessho-v2-storage-maintenance
schedule: 23 4 1,16 * *
command: select * from public.kessho_run_preset_storage_maintenance_v2(false);
```

## Before Applying SQL

Run these checks in Supabase SQL Editor and save the result sets:

```sql
select public.kessho_preset_storage_v2_dry_run_report();
```

Check duplicate active logical identities before enabling stricter save behavior:

```sql
select
  owner_key,
  type,
  coalesce(scope, '') as scope_key,
  lower(btrim(name)) as name_key,
  count(*) as active_rows,
  array_agg(id order by updated_at desc) as ids,
  array_agg(name order by updated_at desc) as names
from public.presets_v2
where deleted_at is null
group by owner_key, type, coalesce(scope, ''), lower(btrim(name))
having count(*) > 1
order by active_rows desc;
```

## Safe Schema Migration

Apply:

```text
supabase/migrations/20260528004000_preset_storage_v2_policy_alignment.sql
```

For a Free-plan project without a linked Supabase CLI workflow, paste the migration into Supabase SQL Editor after taking the local export above.

This migration:

- converts existing refs to latest-following refs
- enforces `follow_latest = true` and `target_version_no is null`
- adds caller-supplied-hash payload helper overload
- adds legacy soft-delete columns and RPC
- adds dry-run storage report
- adds transaction-scoped advisory-locked maintenance function

The atomic `kessho_save_preset_v2(...)` RPC is now part of the production schema. The app save path prepares caller-supplied TypeScript hashes and sends identity, payload, version, and ref rows to this RPC in one transaction.

## First Maintenance Run

Dry run:

```sql
select * from public.kessho_run_preset_storage_maintenance_v2(true);
```

If the counts match expectations, execute:

```sql
select * from public.kessho_run_preset_storage_maintenance_v2(false);
```

Then re-run:

```sql
select public.kessho_preset_storage_v2_dry_run_report();
```

## Cron

After the app has been switched to the atomic save RPC and the maintenance dry run is clean, schedule the 1st/16th job by applying:

```text
supabase/migrations/20260528014500_preset_storage_v2_maintenance_cron.sql
```

Equivalent SQL:

```sql
select cron.schedule(
  'kessho-v2-storage-maintenance',
  '23 4 1,16 * *',
  $$ select * from public.kessho_run_preset_storage_maintenance_v2(false); $$
);
```

Use one coordinated maintenance path. If an older daily purge cron exists, disable it before enabling this one. The maintenance RPC uses `pg_try_advisory_xact_lock` so it is safe through Supabase's transaction pooler.
