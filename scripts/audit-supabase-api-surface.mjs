#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const PUBLIC_TABLES = [
  'presets',
  'presets_v2',
  'preset_versions_v2',
  'preset_version_refs_v2',
  'preset_payloads_v2',
  'preset_summaries_v2',
  'legacy_preset_summaries',
];

const SUMMARY_VIEW_REST_CHECKS = [
  ['preset_summaries_v2', '*'],
  ['legacy_preset_summaries', '*'],
];

const BASE_TABLE_REST_CHECKS = [
  ['presets_v2', 'id,name,latest_version_no'],
  ['preset_versions_v2', 'id,preset_id,version_no,resolved_hash'],
  ['preset_version_refs_v2', 'version_id,target_preset_id'],
  ['preset_payloads_v2', 'hash,payload,payload_bytes'],
  ['presets', 'id,name,versions'],
];

const DETAIL_RPC_CHECKS = [
  {
    name: 'kessho_get_preset_detail_v2',
    params: {
      target_preset_id: null,
      target_type: null,
      target_name: null,
      target_scopes: null,
      target_version_no: null,
    },
    expectedGuardText: 'target_preset_id or target_type/target_name is required',
  },
  {
    name: 'kessho_get_legacy_preset_detail',
    params: {
      target_preset_id: null,
      target_type: null,
      target_name: null,
      target_scopes: null,
    },
    expectedGuardText: 'target_preset_id or target_type/target_name is required',
  },
  {
    name: 'kessho_get_preset_latest_manifest_v2',
    params: {
      target_preset_id: '00000000-0000-4000-8000-000000000000',
    },
  },
];

const RUNTIME_RPC_CHECKS = [
  {
    name: 'kessho_lookup_preset_rows_v2',
    params: {
      target_preset_id: null,
      target_type: null,
      target_name: '__audit_missing__',
      target_scopes: null,
      target_scope_is_null: false,
      target_resolved_hash: null,
      exclude_preset_id: null,
      include_deleted: false,
      deleted_only: false,
      include_internal_derived: false,
      internal_derived_only: false,
      max_rows: 1,
      page_offset: 0,
    },
  },
  {
    name: 'kessho_get_preset_versions_v2',
    params: { target_preset_id: '00000000-0000-4000-8000-000000000000' },
  },
  {
    name: 'kessho_get_preset_version_ref_keys_v2',
    params: { target_version_id: '00000000-0000-4000-8000-000000000000' },
  },
  {
    name: 'kessho_get_latest_ref_targets_v2',
    params: { target_version_id: '00000000-0000-4000-8000-000000000000' },
  },
  {
    name: 'kessho_get_preset_payloads_v2',
    params: { target_hashes: [] },
  },
  {
    name: 'kessho_get_missing_preset_payloads_v2',
    params: { target_hashes: [] },
  },
  {
    name: 'kessho_lookup_preset_id_v2',
    params: {
      target_type: 'state',
      target_name: '__audit_missing__',
      target_scope: 'global',
      target_resolved_hash: null,
    },
  },
  {
    name: 'kessho_get_preset_card_v2',
    params: { target_preset_id: '00000000-0000-4000-8000-000000000000' },
  },
  {
    name: 'kessho_exists_preset_logical_key_v2',
    params: {
      target_type: 'state',
      target_name: '__audit_missing__',
      target_scope: 'global',
    },
  },
  {
    name: 'kessho_rename_preset_v2',
    params: {
      target_preset_id: '00000000-0000-4000-8000-000000000000',
      rename_payload: { name: '__audit_missing__' },
    },
  },
  {
    name: 'kessho_rename_legacy_preset',
    params: {
      target_preset_id: '00000000-0000-4000-8000-000000000000',
      rename_payload: { name: '__audit_missing__' },
    },
  },
  {
    name: 'kessho_find_preset_references_v2',
    params: { target_type: 'state', target_name: '__audit_missing__' },
  },
  {
    name: 'kessho_get_preset_storage_stats_v2',
    params: {},
  },
  {
    name: 'kessho_save_legacy_preset',
    params: { preset_payload: {} },
    expectedGuardText: 'Legacy preset type is required',
  },
];

function parseArgs(argv) {
  const args = {
    json: false,
    failOpenBaseTables: false,
    requireDetailRpcs: false,
    requireRuntimeRpcs: false,
    requireSummaryViews: false,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--fail-open-base-tables') args.failOpenBaseTables = true;
    else if (arg === '--require-detail-rpcs') args.requireDetailRpcs = true;
    else if (arg === '--require-runtime-rpcs') args.requireRuntimeRpcs = true;
    else if (arg === '--require-summary-views') args.requireSummaryViews = true;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node scripts/audit-supabase-api-surface.mjs [options]',
        '',
        'Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for direct REST checks.',
        'Signs in anonymously to verify detail RPC availability.',
        'Reads SUPABASE_DB_URL for grant, policy, and size SQL checks.',
        '',
        'Options:',
        '  --json                    Emit the full report as JSON.',
        '  --fail-open-base-tables   Exit non-zero if raw anon or anonymous-auth REST can read base tables.',
        '  --require-detail-rpcs     Exit non-zero if app-session detail RPCs are missing or blocked.',
        '  --require-runtime-rpcs    Exit non-zero if app-session runtime RPCs are missing or blocked.',
        '  --require-summary-views   Exit non-zero if raw anon or anonymous-auth REST cannot read summary views.',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index);
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

function getEnv() {
  const cwd = process.cwd();
  return {
    ...readEnvFile(resolve(cwd, '.env')),
    ...readEnvFile(resolve(cwd, '.env.local')),
    ...process.env,
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function supabaseErrorSummary(error) {
  if (!error || typeof error !== 'object') return String(error ?? '');
  return [
    error.code,
    error.status,
    error.statusCode,
    error.message,
    error.details,
    error.hint,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map(String)
    .join(' ');
}

async function fetchRestCheck({ supabaseUrl, supabaseKey, table, select }) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set('select', select);
  url.searchParams.set('limit', '5');

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  });
  const body = await response.text();
  return {
    table,
    select,
    status: response.status,
    ok: response.ok,
    bytes: new TextEncoder().encode(body).byteLength,
    sample: body.slice(0, 500),
  };
}

async function fetchAuthorizedRestCheck({ supabaseUrl, supabaseKey, authorizationToken, table, select }) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.searchParams.set('select', select);
  url.searchParams.set('limit', '5');

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${authorizationToken}`,
      Accept: 'application/json',
    },
  });
  const body = await response.text();
  return {
    table,
    select,
    status: response.status,
    ok: response.ok,
    bytes: new TextEncoder().encode(body).byteLength,
    sample: body.slice(0, 500),
  };
}

function emptyDetailRpcReport(reason) {
  return {
    skipped: true,
    reason,
    checks: [],
    missingOrBlocked: [],
  };
}

function emptyRuntimeRpcReport(reason) {
  return {
    skipped: true,
    reason,
    checks: [],
    missingOrBlocked: [],
  };
}

function blockedDetailRpcReport(reason) {
  return {
    skipped: false,
    authOk: false,
    authError: reason,
    checks: [],
    missingOrBlocked: DETAIL_RPC_CHECKS.map((check) => ({
      name: check.name,
      reason,
    })),
  };
}

function blockedRuntimeRpcReport(reason) {
  return {
    skipped: false,
    authOk: false,
    authError: reason,
    checks: [],
    missingOrBlocked: RUNTIME_RPC_CHECKS.map((check) => ({
      name: check.name,
      reason,
    })),
  };
}

function emptyAuthenticatedRestReport(reason) {
  return {
    skipped: true,
    reason,
    summaryChecks: [],
    baseChecks: [],
    openBaseTables: [],
    unreadableSummaryViews: [],
  };
}

function blockedAuthenticatedRestReport(reason) {
  return {
    skipped: false,
    authOk: false,
    authError: reason,
    summaryChecks: [],
    baseChecks: [],
    openBaseTables: [],
    unreadableSummaryViews: [],
  };
}

async function runAnonymousSessionChecks(env) {
  const supabaseUrl = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    const reason = 'Missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY.';
    return {
      skipped: true,
      reason,
      detailRpcs: emptyDetailRpcReport(reason),
      runtimeRpcs: emptyRuntimeRpcReport(reason),
      authenticatedRest: emptyAuthenticatedRestReport(reason),
    };
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: authData, error: authError } = await client.auth.signInAnonymously();
  if (authError) {
    const reason = supabaseErrorSummary(authError);
    return {
      skipped: false,
      authOk: false,
      authError: reason,
      detailRpcs: blockedDetailRpcReport(reason),
      runtimeRpcs: blockedRuntimeRpcReport(reason),
      authenticatedRest: blockedAuthenticatedRestReport(reason),
    };
  }

  const authorizationToken = authData.session?.access_token;
  if (!authorizationToken) {
    const reason = 'anonymous auth did not return an access token';
    return {
      skipped: false,
      authOk: false,
      authError: reason,
      detailRpcs: blockedDetailRpcReport(reason),
      runtimeRpcs: blockedRuntimeRpcReport(reason),
      authenticatedRest: blockedAuthenticatedRestReport(reason),
    };
  }

  async function runRpcChecks(checks) {
    const results = [];
    for (const check of checks) {
      try {
        const { data, error } = await client.rpc(check.name, check.params);
        const errorText = supabaseErrorSummary(error);
        const expectedGuardReached = check.expectedGuardText
          ? errorText.toLowerCase().includes(check.expectedGuardText.toLowerCase())
          : false;
        results.push({
          name: check.name,
          callable: !error || expectedGuardReached,
          expectedGuardReached,
          returnedNull: !error && data === null,
          error: error ? errorText : null,
        });
      } catch (error) {
        results.push({
          name: check.name,
          callable: false,
          expectedGuardReached: false,
          returnedNull: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

  const detailChecks = await runRpcChecks(DETAIL_RPC_CHECKS);
  const runtimeChecks = await runRpcChecks(RUNTIME_RPC_CHECKS);

  const summaryChecks = await Promise.all(
    SUMMARY_VIEW_REST_CHECKS.map(([table, select]) => fetchAuthorizedRestCheck({
      supabaseUrl,
      supabaseKey,
      authorizationToken,
      table,
      select,
    })),
  );
  const baseChecks = await Promise.all(
    BASE_TABLE_REST_CHECKS.map(([table, select]) => fetchAuthorizedRestCheck({
      supabaseUrl,
      supabaseKey,
      authorizationToken,
      table,
      select,
    })),
  );

  return {
    skipped: false,
    authOk: true,
    detailRpcs: {
      skipped: false,
      authOk: true,
      checks: detailChecks,
      missingOrBlocked: detailChecks.filter((check) => !check.callable),
    },
    runtimeRpcs: {
      skipped: false,
      authOk: true,
      checks: runtimeChecks,
      missingOrBlocked: runtimeChecks.filter((check) => !check.callable),
    },
    authenticatedRest: {
      skipped: false,
      authOk: true,
      summaryChecks,
      baseChecks,
      openBaseTables: baseChecks.filter((check) => check.ok && check.bytes > 2),
      unreadableSummaryViews: summaryChecks.filter((check) => !check.ok),
    },
  };
}

async function runRestChecks(env) {
  const supabaseUrl = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return {
      skipped: true,
      reason: 'Missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      checks: [],
    };
  }

  const summaryChecks = await Promise.all(
    SUMMARY_VIEW_REST_CHECKS.map(([table, select]) => fetchRestCheck({ supabaseUrl, supabaseKey, table, select })),
  );
  const baseChecks = await Promise.all(
    BASE_TABLE_REST_CHECKS.map(([table, select]) => fetchRestCheck({ supabaseUrl, supabaseKey, table, select })),
  );
  return {
    skipped: false,
    summaryChecks,
    baseChecks,
    openBaseTables: baseChecks.filter((check) => check.ok && check.bytes > 2),
    unreadableSummaryViews: summaryChecks.filter((check) => !check.ok),
  };
}

async function query(client, text) {
  const result = await client.query(text);
  return result.rows;
}

async function runSqlChecks(env) {
  if (!env.SUPABASE_DB_URL) {
    return {
      skipped: true,
      reason: 'Missing SUPABASE_DB_URL.',
    };
  }

  const client = new Client({ connectionString: env.SUPABASE_DB_URL });
  await client.connect();
  try {
    const quotedTables = PUBLIC_TABLES.map((table) => `'${table}'`).join(',');
    const grants = await query(client, `
      select
        grantee,
        table_name,
        privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated')
        and table_name in (${quotedTables})
      order by table_name, grantee, privilege_type
    `);

    const policies = await query(client, `
      select
        schemaname,
        tablename,
        policyname,
        roles,
        cmd,
        qual,
        with_check
      from pg_policies
      where schemaname = 'public'
        and tablename in (
          'presets',
          'presets_v2',
          'preset_versions_v2',
          'preset_version_refs_v2',
          'preset_payloads_v2'
        )
      order by tablename, policyname
    `);

    const viewOptions = await query(client, `
      select
        c.relname as view_name,
        coalesce(c.reloptions, array[]::text[]) as options
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
        and c.relname in ('preset_summaries_v2', 'legacy_preset_summaries')
      order by c.relname
    `);

    const sizeReport = await query(client, `
      select 'preset_summaries_v2' as source,
             count(*)::bigint as rows,
             coalesce(sum(octet_length(row_to_json(s)::text)), 0)::bigint as json_bytes
        from public.preset_summaries_v2 s
      union all
      select 'presets_v2_full_rows' as source,
             count(*)::bigint as rows,
             coalesce(sum(octet_length(row_to_json(p)::text)), 0)::bigint as json_bytes
        from public.presets_v2 p
       where deleted_at is null
      union all
      select 'legacy_preset_summaries' as source,
             count(*)::bigint as rows,
             coalesce(sum(octet_length(row_to_json(s)::text)), 0)::bigint as json_bytes
        from public.legacy_preset_summaries s
      union all
      select 'legacy_presets_full_rows' as source,
             count(*)::bigint as rows,
             coalesce(sum(octet_length(row_to_json(p)::text)), 0)::bigint as json_bytes
        from public.presets p
       where deleted_at is null
      union all
      select 'preset_payloads_v2' as source,
             count(*)::bigint as rows,
             coalesce(sum(coalesce(payload_bytes, octet_length(payload::text))), 0)::bigint as json_bytes
        from public.preset_payloads_v2
    `);

    return {
      skipped: false,
      grants,
      policies,
      viewOptions,
      sizeReport,
      broadSelectGrants: grants.filter((grant) => (
        grant.privilege_type === 'SELECT'
        && ['anon', 'authenticated'].includes(grant.grantee)
        && BASE_TABLE_REST_CHECKS.some(([table]) => table === grant.table_name)
      )),
    };
  } finally {
    await client.end();
  }
}

const args = parseArgs(process.argv.slice(2));
const env = getEnv();
const [rest, anonymousSession, sql] = await Promise.all([
  runRestChecks(env),
  runAnonymousSessionChecks(env),
  runSqlChecks(env),
]);
const { detailRpcs, runtimeRpcs, authenticatedRest } = anonymousSession;

const report = {
  generatedAt: new Date().toISOString(),
  rest,
  detailRpcs,
  runtimeRpcs,
  authenticatedRest,
  sql,
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Supabase API surface audit');
  if (rest.skipped) {
    console.log(`- REST checks skipped: ${rest.reason}`);
  } else {
    for (const check of rest.summaryChecks) {
      console.log(`- Summary view REST ${check.table}: ${check.status}, ${formatBytes(check.bytes)}, select=${check.select}`);
    }
    for (const check of rest.baseChecks) {
      const state = check.ok && check.bytes > 2 ? 'OPEN' : 'blocked/empty';
      console.log(`- Base REST ${check.table}: ${state}, status=${check.status}, bytes=${formatBytes(check.bytes)}, select=${check.select}`);
    }
  }

  if (authenticatedRest.skipped) {
    console.log(`- Anonymous-auth REST checks skipped: ${authenticatedRest.reason}`);
  } else if (!authenticatedRest.authOk) {
    console.log(`- Anonymous-auth REST checks blocked: anonymous auth failed: ${authenticatedRest.authError}`);
  } else {
    for (const check of authenticatedRest.summaryChecks) {
      console.log(`- Anonymous-auth summary view REST ${check.table}: ${check.status}, ${formatBytes(check.bytes)}, select=${check.select}`);
    }
    for (const check of authenticatedRest.baseChecks) {
      const state = check.ok && check.bytes > 2 ? 'OPEN' : 'blocked/empty';
      console.log(`- Anonymous-auth base REST ${check.table}: ${state}, status=${check.status}, bytes=${formatBytes(check.bytes)}, select=${check.select}`);
    }
  }

  if (detailRpcs.skipped) {
    console.log(`- Detail RPC checks skipped: ${detailRpcs.reason}`);
  } else if (!detailRpcs.authOk) {
    console.log(`- Detail RPC checks blocked: anonymous auth failed: ${detailRpcs.authError}`);
  } else {
    for (const check of detailRpcs.checks) {
      const state = check.callable ? 'callable' : 'missing/blocked';
      const reason = check.expectedGuardReached ? 'argument guard reached' : (check.error ?? 'no error');
      console.log(`- Detail RPC ${check.name}: ${state}, ${reason}`);
    }
  }

  if (runtimeRpcs.skipped) {
    console.log(`- Runtime RPC checks skipped: ${runtimeRpcs.reason}`);
  } else if (!runtimeRpcs.authOk) {
    console.log(`- Runtime RPC checks blocked: anonymous auth failed: ${runtimeRpcs.authError}`);
  } else {
    for (const check of runtimeRpcs.checks) {
      const state = check.callable ? 'callable' : 'missing/blocked';
      const reason = check.expectedGuardReached ? 'argument guard reached' : (check.error ?? 'no error');
      console.log(`- Runtime RPC ${check.name}: ${state}, ${reason}`);
    }
  }

  if (sql.skipped) {
    console.log(`- SQL checks skipped: ${sql.reason}`);
  } else {
    console.log(`- Broad base-table SELECT grants: ${sql.broadSelectGrants.length}`);
    for (const grant of sql.broadSelectGrants) {
      console.log(`  ${grant.table_name}: ${grant.grantee} ${grant.privilege_type}`);
    }
    console.log('- Summary view options:');
    for (const row of sql.viewOptions) {
      const options = Array.isArray(row.options) && row.options.length ? row.options.join(',') : '(default)';
      console.log(`  ${row.view_name}: ${options}`);
    }
    console.log('- Size estimates:');
    for (const row of sql.sizeReport) {
      console.log(`  ${row.source}: rows=${row.rows}, json=${formatBytes(Number(row.json_bytes))}`);
    }
  }
}

if (args.failOpenBaseTables && !rest.skipped && rest.openBaseTables.length > 0) {
  console.error('Base tables are directly readable through the raw anon REST API.');
  process.exit(1);
}

if (args.failOpenBaseTables && !authenticatedRest.skipped && authenticatedRest.openBaseTables.length > 0) {
  console.error('Base tables are directly readable through the anonymous-authenticated REST API.');
  process.exit(1);
}

if (args.requireDetailRpcs && !detailRpcs.skipped && detailRpcs.missingOrBlocked.length > 0) {
  console.error('Detail RPCs are missing or blocked for an app-style anonymous Auth session.');
  process.exit(1);
}

if (args.requireDetailRpcs && detailRpcs.skipped) {
  console.error(`Detail RPC checks were skipped: ${detailRpcs.reason}`);
  process.exit(1);
}

if (args.requireRuntimeRpcs && !runtimeRpcs.skipped && runtimeRpcs.missingOrBlocked.length > 0) {
  console.error('Runtime RPCs are missing or blocked for an app-style anonymous Auth session.');
  process.exit(1);
}

if (args.requireRuntimeRpcs && runtimeRpcs.skipped) {
  console.error(`Runtime RPC checks were skipped: ${runtimeRpcs.reason}`);
  process.exit(1);
}

if (args.requireSummaryViews && !rest.skipped && rest.unreadableSummaryViews.length > 0) {
  console.error('Summary views are not readable through the raw anon REST API.');
  process.exit(1);
}

if (args.requireSummaryViews && !authenticatedRest.skipped && authenticatedRest.unreadableSummaryViews.length > 0) {
  console.error('Summary views are not readable through the anonymous-authenticated REST API.');
  process.exit(1);
}

if (args.requireSummaryViews && (rest.skipped || authenticatedRest.skipped)) {
  const reason = rest.skipped ? rest.reason : authenticatedRest.reason;
  console.error(`Summary view checks were skipped: ${reason}`);
  process.exit(1);
}
