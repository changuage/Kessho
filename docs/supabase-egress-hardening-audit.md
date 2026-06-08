# Supabase Egress Hardening Audit

Date: 2026-06-08

Branch: `fix/supabase-egress-hardening`

## Production Risk Found

Supabase usage attributed the restriction to PostgREST egress. The retained Logs Explorer data showed `/rest/v1/presets_v2` as the dominant endpoint, but the visible successful request count did not reconcile with the reported usage. The app-side risk was still real: preset list paths had code paths that could fetch full preset rows, legacy rows embedded `versions`, and the journey library could fan out from a list call into per-journey full `load()` calls to build previews.

## App Changes

- Preset list/search/featured paths now use explicit summary/detail column selects instead of `select('*')`.
- Legacy preset listing uses a summary row projection and no longer materializes inline `versions`.
- V2 preset listing uses `PRESET_V2_SUMMARY_SELECT` with a `limit(200)` cap.
- V2 journey listing skips metadata payload hydration in shared cloud mode.
- `useJourneyPresets()` no longer fans out into per-journey detail loads in shared cloud mode.
- `SupabasePresetStore.list()` has store-level TTL caching, single-flight request collapse, and a short quota/error circuit breaker.
- The older `src/cloud/supabase.ts` module now returns `CloudPresetSummary[]` for list/search/featured calls and loads full `data` only after the explicit load action.
- Dev-only response byte diagnostics are available by setting `localStorage.setItem('kessho:supabaseEgressDebug', '1')`.
- Production Supabase fetch tripwires now estimate per-tab response bytes, warn after 1 MB, pause cloud list refreshes after 5 MB for that tab, and open the read circuit on repeated quota/402 responses.
- `npm run audit:supabase-egress` guards against future broad Supabase `select('*')` and bare `.select()` calls in source.
- Shared anonymous Auth initialization now uses a single in-flight helper across startup and legacy cloud preset actions, reducing duplicate Auth calls.
- Legacy cloud preset writes now establish an anonymous Auth session before insert/increment actions, so raw unauthenticated writes can be blocked by RLS.

## Audit Command Evidence

Commands run from the repository root after hardening:

```text
$ grep -R "select('\*')" -n src scripts supabase || true
scripts/check-supabase-egress-guards.mjs:11:    name: "Supabase select('*')",

$ grep -R 'select("\*")' -n src scripts supabase || true
<no output>

$ grep -R "\.select()" -n src scripts supabase || true
src/ui/state.ts:5175:    textArea.select();
src/ui/snowflakeGenerator/SnowflakeGeneratorPage.tsx:1225:  textarea.select();

$ grep -R "activeStore.load('journey'" -n src || true
src/presets/useJourneyPresets.ts:221:          const entry = await activeStore.load('journey', summary.name);

$ grep -R "PRESET_V2_SUMMARY_SELECT" -n src || true
src/presets/SupabasePresetStore.ts:58:const PRESET_V2_SUMMARY_SELECT = [
src/presets/SupabasePresetStore.ts:1514:      .select(PRESET_V2_SUMMARY_SELECT)

$ grep -R "createClient(" -n src || true
src/cloud/supabase.ts:71:  supabase = createClient(url, anonKey, {
```

Interpretation:

- The `select('*')` hit is the guard script's own diagnostic label, not a Supabase query.
- The bare `.select()` hits are DOM textarea selection calls, not Supabase/PostgREST calls.
- The journey `activeStore.load('journey')` call remains only behind the shared-cloud early return; local/non-shared mode still keeps previews.

## Database Plan

Migration `supabase/migrations/20260608000000_preset_summary_views.sql` adds:

- `public.preset_summaries_v2`
- `public.legacy_preset_summaries`

Both views use `security_invoker = true` so underlying RLS remains authoritative. The migration grants view `SELECT` access to `anon` and `authenticated`, but intentionally does not revoke base-table access yet.

Base-table revokes are planned only after detail RPCs are ready and the app no longer directly reads:

- `public.presets_v2`
- `public.preset_versions_v2`
- `public.preset_version_refs_v2`
- `public.preset_payloads_v2`
- `public.presets`

Migration `supabase/migrations/20260608003000_harden_preset_shared_permissions.sql` hardens the current shared-editing model:

- Revokes broad/default function execute grants from public API roles.
- Replaces the V2 atomic save RPC so it requires Auth, forces shared `owner_key = 'public'`, clears client-supplied `owner_user_id`, and refuses UUID-targeted writes outside the shared namespace.
- Moves V2 version pruning into the save RPC so the browser does not need direct delete permission on version rows.
- Drops V2 direct write policies and revokes V2 table insert/update/delete from `anon` and `authenticated`.
- Keeps V2 summary/detail reads available through RLS, with payload reads requiring an authenticated session.
- Keeps legacy `presets` reads public but requires anonymous Auth for legacy inserts/updates and `increment_plays`.
- Adds `npm run audit:supabase-security` to guard against broad function execute grants and direct V2 table write grants returning in migrations.

Supabase UI requirements for this shared model:

- Authentication -> Sign In / Providers: enable Anonymous sign-ins.
- Data API settings: keep Data API enabled for the public schema, disable automatic exposure for new tables, and keep automatic RLS enabled for new public tables.
- SQL Editor: apply both migrations above to the active project.
- Table editor / Authentication policies: confirm raw `anon` can read summaries but cannot call save/delete RPCs or write base tables; anonymous Auth users should be able to save/delete shared presets.
- API keys: keep only the publishable/anon key in the browser; never place a service-role or secret key in Vite env files.

## SQL Size-Proof Status

The SQL size-estimate queries from the plan have not been run against the remote database from this workspace because no SQL-capable Supabase CLI/MCP/database connection is available here. The checked environment has public browser Supabase config only, which is enough for app/API validation but not enough to execute arbitrary SQL or apply migrations.

Tiny REST probes on 2026-06-08 also show the project is still restricted, so Data API validation cannot currently distinguish missing views from the active quota restriction:

```text
preset_summaries_v2 view: status 402, response body 189 bytes
legacy_preset_summaries view: status 402, response body 189 bytes
presets_v2 summary projection: status 402, response body 189 bytes
```

Run the size checks from the Supabase SQL Editor before applying base-table revokes, then paste the output below.

## Browser Validation

Local dev server validation on 2026-06-08:

```text
npm run dev -- --host 127.0.0.1 --port 5173
```

Browser setup:

```js
localStorage.setItem('kessho:supabaseEgressDebug', '1')
```

Because the Supabase project is still restricted, successful KB-scale list bodies cannot be proven yet. The restricted-path validation is still useful: after the shared read circuit change, a fresh app load over a 15 second window produced exactly one Supabase REST response:

```text
GET /rest/v1/presets_v2?select=id&limit=1
status: 402
bodyBytes: 189
count: 1
```

There were no repeated list/detail requests, no journey fan-out, and no rapid retry loop after the quota response.

### V2 Full vs Summary JSON Estimate

```sql
select
  count(*) as rows,
  pg_size_pretty(
    sum(octet_length(row_to_json(p)::text))::bigint
  ) as full_presets_v2_json_estimate
from public.presets_v2 p;

select
  count(*) as rows,
  pg_size_pretty(
    sum(
      octet_length(
        json_build_object(
          'id', id,
          'owner_user_id', owner_user_id,
          'type', type,
          'scope', scope,
          'name', name,
          'author', author,
          'library', library,
          'creator', creator,
          'description', description,
          'tags', tags,
          'visibility', visibility,
          'family_name', family_name,
          'variant_name', variant_name,
          'variant_rank', variant_rank,
          'latest_version_no', latest_version_no,
          'latest_metadata_hash', latest_metadata_hash,
          'play_count', play_count,
          'rating', rating,
          'deleted_at', deleted_at,
          'created_at', created_at,
          'updated_at', updated_at
        )::text
      )
    )::bigint
  ) as summary_presets_v2_json_estimate
from public.presets_v2;
```

### Legacy Full vs Summary JSON Estimate

```sql
select
  count(*) as rows,
  pg_size_pretty(
    sum(octet_length(row_to_json(p)::text))::bigint
  ) as full_legacy_presets_json_estimate
from public.presets p;

select
  count(*) as rows,
  pg_size_pretty(
    sum(
      octet_length(
        json_build_object(
          'id', id,
          'user_id', user_id,
          'type', type,
          'scope', scope,
          'name', name,
          'author', author,
          'library', library,
          'creator', creator,
          'description', description,
          'tags', tags,
          'visibility', visibility,
          'family_name', family_name,
          'variant_name', variant_name,
          'variant_rank', variant_rank,
          'forked_from', forked_from,
          'plays', plays,
          'current_version', current_version,
          'created_at', created_at,
          'updated_at', updated_at,
          'rating', rating
        )::text
      )
    )::bigint
  ) as summary_legacy_presets_json_estimate
from public.presets;
```

## Supabase Docs Checked

- Supabase RLS docs: public-schema tables should use RLS, and Postgres 15+ views should use `security_invoker = true` when they need to respect underlying RLS.
- Supabase April/May 2026 changelog: Data API exposure/grants are separate from RLS, and new projects increasingly require explicit grants for Data API access.
