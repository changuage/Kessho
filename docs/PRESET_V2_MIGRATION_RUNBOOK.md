# Preset V2 Migration Runbook

Use this after `presets_v2`, `preset_versions_v2`, `preset_version_refs_v2`, and `preset_payloads_v2` exist in Supabase with RLS enabled.

If the V2 tables already exist, also run [preset_storage_v2_internal_derived.sql](/Users/panguroo/Documents/generativemusic/docs/preset_storage_v2_internal_derived.sql:1). This adds the hash lookup index and RLS read rule needed for private hidden child presets referenced by shared L4/L3 presets.

## What This Migrates

The browser migration helper runs in this order:

1. Stock L1 engine presets
2. Stock L2 kit presets
3. Stock L3 source presets
4. Latest legacy L1-L3 presets from the old `presets` table
5. The latest canonical `String Waves` L4 state preset

The helper intentionally migrates only the latest version of each preset. That keeps V2 clean and avoids bringing old duplicate history forward.

Current expected dry-run stock counts:

- Stock L1: `241`
- Stock L2: `19`
- Stock L3: `50`

The L1 count includes one shared `euclideanPattern` bank of `32` presets. Drum and synth Euclidean dropdowns both use that same bank, so the migration no longer seeds separate duplicated `drumEuclidean` and `synthEuclidean` stock pattern rows.

## Why It Runs In The Browser

The project already has the Supabase anon key, anonymous auth, and preset source modules in the browser app. Running from the app also means the migration uses the same V2 store adapter that normal saves use.

## Run The Migration

Start or redeploy the app build that includes the V2 migration helper.

In local development:

```bash
node node_modules/vite/bin/vite.js
```

Open the app, then open the browser console.

First run a dry run:

```js
await window.kesshoPresetV2Migration.run()
```

Review the returned phase counts and errors. Dry run does not write anything.

If the counts look good, run the write pass:

```js
await window.kesshoPresetV2Migration.run({
  dryRun: false,
  confirm: 'MIGRATE_PRESETS_V2',
})
```

Then verify table counts:

```js
await window.kesshoPresetV2Migration.verify()
```

Then optimize the latest `String Waves` graph:

```js
await window.kesshoPresetV2Migration.optimizeStringWaves({
  dryRun: false,
  confirm: 'MIGRATE_PRESETS_V2',
})
```

This creates `String Waves` child source/kit presets from the actual latest state snapshot and appends a new optimized `String Waves` version so the L4 preset can reference those children.

If existing `String Waves` variants were saved before the current recursive L4 -> L3 -> L2 -> L1 graph, repair the graph:

```js
await window.kesshoPresetV2Migration.repairStringWavesGraph({
  dryRun: false,
  confirm: 'MIGRATE_PRESETS_V2',
})
```

This re-saves the canonical `String Waves` child presets under the current graph, then re-saves `String Waves` and `String Waves Drums` so unchanged sources share refs again. The V2 save path also normalizes missing default-valued keys before hashing, so older presets that omit newly added default params do not create false derived children.

## Optional Partial Runs

Seed only stock presets:

```js
await window.kesshoPresetV2Migration.run({
  dryRun: false,
  confirm: 'MIGRATE_PRESETS_V2',
  includeLegacyL1L3: false,
  includeStringWaves: false,
})
```

Migrate only latest legacy L1-L3 and `String Waves`:

```js
await window.kesshoPresetV2Migration.run({
  dryRun: false,
  confirm: 'MIGRATE_PRESETS_V2',
  includeStock: false,
})
```

## SQL Verification

Check preset counts by level and scope:

```sql
select type, scope, count(*)
from public.presets_v2
group by type, scope
order by type, scope;
```

Check version strategy:

```sql
select p.type, p.scope, p.name, v.version_no, v.storage_mode, v.is_checkpoint
from public.preset_versions_v2 v
join public.presets_v2 p on p.id = v.preset_id
order by p.type, p.scope, p.name, v.version_no;
```

Check `String Waves` refs:

```sql
select p.name, r.ref_slot, target.name as target_name, target.type, target.scope
from public.preset_version_refs_v2 r
join public.preset_versions_v2 v on v.id = r.version_id
join public.presets_v2 p on p.id = v.preset_id
join public.presets_v2 target on target.id = r.target_preset_id
where lower(trim(p.name)) = 'string waves'
order by r.ref_slot;
```

Check payload footprint:

```sql
select payload_kind, count(*) as rows, sum(payload_bytes) as total_bytes
from public.preset_payloads_v2
group by payload_kind
order by payload_kind;
```

Check hidden auto-derived children:

```sql
select type, scope, visibility, count(*) as rows
from public.presets_v2
where 'internal-derived' = any(tags)
group by type, scope, visibility
order by type, scope;
```

Prune old V2 versions and then remove hidden derived children no longer referenced by the retained versions:

```sql
select public.kessho_prune_preset_versions_v2(5) as deleted_versions;
select public.kessho_prune_internal_derived_v2() as deleted_internal_children;
```

## Expected Notes

Future V2 saves create hidden private child presets automatically when a child payload has no exact saved preset. Those rows are named `__derived__/{scope}/{hash12}`, tagged `internal-derived`, excluded from dropdowns, and reused by content hash across sibling L4/L3/L2 presets.

The child graph is recursive: L4 state presets split into L3/L2 children, L3 source presets split into L2 kits and L1 engines, and L2 kits split into their owned L1 engines. That covers pad, lead, drum voice, granular voice, delay, dynamics sidechain/character/degrade/end-chain engines, water, and insect engine scopes.

Synth and drum source presets can both reference the shared `euclideanPattern` bank when lane-one pattern data matches a seeded pattern. The parent source keeps any drum-specific or synth-specific edits that the shared pattern cannot reconstruct.

The migration skips V2 presets that already have at least one version, so it is safe to rerun after partial success.
