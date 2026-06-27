#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const args = new Set(process.argv.slice(2));
const outputJson = args.has('--json');
const requireDb = args.has('--require-db');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
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

const cwd = process.cwd();
const env = {
  ...readEnvFile(path.join(cwd, '.env')),
  ...readEnvFile(path.join(cwd, '.env.local')),
  ...process.env,
};

const databaseUrl = env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DB_URL;

function printReport(report) {
  if (outputJson) console.log(JSON.stringify(report, null, 2));
  else if (report.status === 'skipped') {
    console.log(`Supabase optimization DB proof skipped: ${report.reason}`);
  } else {
    console.log('Supabase optimization DB proof passed.');
    console.log(`- test preset: ${report.save.testName}`);
    console.log(`- duplicate payload rows for resolved hash: ${report.save.resolvedPayloadRows}`);
    console.log(`- immediate duplicate last_seen_at stable: ${report.save.lastSeenStable}`);
    console.log(`- active legacy rows for test name: ${report.save.activeLegacyRows}`);
    console.log(`- narrow id/card/existence/rename RPCs passed: ${report.narrowRpc.renamedLookupId === report.save.presetId}`);
    console.log(`- bad hash rejected: ${report.hashVerification.badHashRejected}`);
    console.log(`- missing hash rejected: ${report.hashVerification.missingHashRejected}`);
    console.log(`- purge dry-run non-mutating: ${report.purge.dryRunNonMutating}`);
    console.log(`- orphan cleanup deleted test orphan inside rollback transaction: ${report.purge.orphanDeletedInTransaction}`);
    console.log('- transaction rolled back: true');
  }
}

if (!databaseUrl) {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'skipped',
    reason: 'Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.',
  };
  if (requireDb) throw new Error(report.reason);
  printReport(report);
  process.exit(0);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: /(?:localhost|127\.0\.0\.1|\[::1\])/.test(databaseUrl) ? false : { rejectUnauthorized: false },
});

function asJson(value) {
  return JSON.stringify(value);
}

async function dbHash(payload) {
  const result = await client.query(
    "select encode(digest(public.kessho_canonical_jsonb_text($1::jsonb), 'sha256'), 'hex') as hash",
    [asJson(payload)],
  );
  return result.rows[0]?.hash;
}

async function queryScalar(sql, params = []) {
  const result = await client.query(sql, params);
  const row = result.rows[0] ?? {};
  return row[Object.keys(row)[0]];
}

async function queryJson(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0]?.result ?? result.rows[0]?.[Object.keys(result.rows[0] ?? {})[0]];
}

async function expectQueryError(label, pattern, callback) {
  const savepoint = `sp_${label.replace(/[^a-z0-9_]/gi, '_')}`;
  await client.query(`savepoint ${savepoint}`);
  let caught = null;
  try {
    await callback();
  } catch (error) {
    caught = error;
  }

  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);

  if (!caught) {
    throw new Error(`${label} unexpectedly succeeded`);
  }

  const message = String(caught.message ?? caught);
  if (!pattern.test(message)) {
    throw new Error(`${label} failed with unexpected error: ${message}`);
  }
  return message;
}

async function savePreset({ name, versionNo, parentVersionId, resolvedHash, metadataHash, resolvedPayload, metadataPayload }) {
  const now = new Date().toISOString();
  const identityPayload = {
    type: 'state',
    scope: null,
    name,
    author: 'Optimization Proof',
    library: 'cloud',
    creator: 'Optimization Proof',
    description: 'Rollback-only Supabase optimization proof preset',
    tags: ['optimization-proof'],
    visibility: 'public',
    owner_key: 'public',
  };
  const versionPayload = {
    version_no: versionNo,
    parent_version_id: parentVersionId ?? null,
    storage_mode: 'snapshot',
    note: 'optimization proof',
    resolved_hash: resolvedHash,
    metadata_hash: metadataHash,
    is_checkpoint: true,
    created_at: now,
  };
  const payloadsPayload = [
    { hash: resolvedHash, payload_kind: 'resolved', payload: resolvedPayload },
    { hash: metadataHash, payload_kind: 'metadata', payload: metadataPayload },
  ];
  return queryJson(
    'select public.kessho_save_preset_v2($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as result',
    [asJson(identityPayload), asJson(versionPayload), asJson(payloadsPayload), '[]'],
  );
}

let transactionOpen = false;

try {
  await client.connect();
  await client.query('begin');
  transactionOpen = true;
  await client.query("set local statement_timeout = '30s'");
  await client.query("set local lock_timeout = '5s'");

  const requiredFunctions = [
    'kessho_canonical_jsonb_text',
    'kessho_save_preset_v2',
    'kessho_get_preset_latest_manifest_v2',
    'kessho_get_missing_preset_payloads_v2',
    'kessho_lookup_preset_id_v2',
    'kessho_get_preset_card_v2',
    'kessho_exists_preset_logical_key_v2',
    'kessho_rename_preset_v2',
    'kessho_assert_payload_hash_matches',
    'kessho_assert_preset_payload_hashes_exist',
    'kessho_purge_deleted_presets_v2',
  ];
  const functionRows = await client.query(
    `
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any($1::text[])
    `,
    [requiredFunctions],
  );
  const presentFunctions = new Set(functionRows.rows.map((row) => row.proname));
  const missingFunctions = requiredFunctions.filter((name) => !presentFunctions.has(name));
  if (missingFunctions.length > 0) {
    throw new Error(`Optimization migration functions are missing: ${missingFunctions.join(', ')}`);
  }

  const proofUserId = '00000000-0000-4000-8000-000000000001';
  await client.query(
    "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)",
    [proofUserId],
  );

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const testName = `egress-v2-save-contract-test-${nonce}`;
  const resolvedPayload = {
    value: 0.1234564,
    negativeHalf: -0.1234565,
    nested: { b: 2, a: 1 },
    proof: nonce,
  };
  const metadataPayload = {
    name: testName,
    author: 'Optimization Proof',
    description: 'Rollback-only Supabase optimization proof preset',
  };
  const resolvedHash = await dbHash(resolvedPayload);
  const metadataHash = await dbHash(metadataPayload);

  const firstSave = await savePreset({
    name: testName,
    versionNo: 1,
    resolvedHash,
    metadataHash,
    resolvedPayload,
    metadataPayload,
  });
  const beforeSeen = await queryScalar(
    'select last_seen_at::text from public.preset_payloads_v2 where hash = $1',
    [resolvedHash],
  );
  const secondSave = await savePreset({
    name: testName,
    versionNo: 2,
    parentVersionId: firstSave?.version?.id,
    resolvedHash,
    metadataHash,
    resolvedPayload,
    metadataPayload,
  });
  const afterSeen = await queryScalar(
    'select last_seen_at::text from public.preset_payloads_v2 where hash = $1',
    [resolvedHash],
  );
  const resolvedPayloadRows = Number(await queryScalar(
    'select count(*)::int from public.preset_payloads_v2 where hash = $1',
    [resolvedHash],
  ));
  const activeLegacyRows = Number(await queryScalar(
    "select count(*)::int from public.presets where lower(btrim(name)) = lower(btrim($1)) and deleted_at is null",
    [testName],
  ));

  const lookedUpPresetId = await queryScalar(
    'select public.kessho_lookup_preset_id_v2($1, $2, $3, $4) as result',
    ['state', testName, null, null],
  );
  const logicalKeyExistsBeforeRename = await queryScalar(
    'select public.kessho_exists_preset_logical_key_v2($1, $2, $3) as result',
    ['state', testName, null],
  );
  const cardBeforeRename = await queryJson(
    'select public.kessho_get_preset_card_v2($1::uuid) as result',
    [firstSave?.preset?.id],
  );

  const renamedName = `${testName}-renamed`;
  const renameResult = await queryJson(
    'select public.kessho_rename_preset_v2($1::uuid, $2::jsonb) as result',
    [
      firstSave?.preset?.id,
      asJson({
        name: renamedName,
        description: 'Rollback-only renamed optimization proof preset',
      }),
    ],
  );
  const oldLogicalKeyExistsAfterRename = await queryScalar(
    'select public.kessho_exists_preset_logical_key_v2($1, $2, $3) as result',
    ['state', testName, null],
  );
  const newLogicalKeyExistsAfterRename = await queryScalar(
    'select public.kessho_exists_preset_logical_key_v2($1, $2, $3) as result',
    ['state', renamedName, null],
  );
  const renamedLookupId = await queryScalar(
    'select public.kessho_lookup_preset_id_v2($1, $2, $3, $4) as result',
    ['state', renamedName, null, null],
  );
  const cardAfterRename = await queryJson(
    'select public.kessho_get_preset_card_v2($1::uuid) as result',
    [firstSave?.preset?.id],
  );

  const badHashMessage = await expectQueryError(
    'bad_hash',
    /Preset payload hash mismatch/i,
    () => savePreset({
      name: `${testName}-bad-hash`,
      versionNo: 1,
      resolvedHash: '0'.repeat(64),
      metadataHash,
      resolvedPayload,
      metadataPayload,
    }),
  );

  const missingPayload = { proof: `${nonce}-missing` };
  const missingHash = await dbHash(missingPayload);
  const missingHashMessage = await expectQueryError(
    'missing_hash',
    /Preset payload hash references missing payload rows/i,
    () => queryJson(
      'select public.kessho_save_preset_v2($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as result',
      [
        asJson({
          type: 'state',
          scope: null,
          name: `${testName}-missing-hash`,
          author: 'Optimization Proof',
          library: 'cloud',
          creator: 'Optimization Proof',
          description: 'Rollback-only missing hash proof',
          tags: ['optimization-proof'],
          visibility: 'public',
          owner_key: 'public',
        }),
        asJson({
          version_no: 1,
          storage_mode: 'snapshot',
          note: 'missing hash proof',
          resolved_hash: missingHash,
          is_checkpoint: true,
          created_at: new Date().toISOString(),
        }),
        '[]',
        '[]',
      ],
    ),
  );

  const beforeDryRunCounts = await client.query(`
    select
      (select count(*)::int from public.presets_v2) as presets,
      (select count(*)::int from public.preset_versions_v2) as versions,
      (select count(*)::int from public.preset_version_refs_v2) as refs,
      (select count(*)::int from public.preset_payloads_v2) as payloads
  `);
  const dryRunReport = await queryJson(
    "select public.kessho_purge_deleted_presets_v2(true, interval '0 seconds', interval '0 seconds', 100) as result",
  );
  const afterDryRunCounts = await client.query(`
    select
      (select count(*)::int from public.presets_v2) as presets,
      (select count(*)::int from public.preset_versions_v2) as versions,
      (select count(*)::int from public.preset_version_refs_v2) as refs,
      (select count(*)::int from public.preset_payloads_v2) as payloads
  `);
  const dryRunNonMutating = JSON.stringify(beforeDryRunCounts.rows[0]) === JSON.stringify(afterDryRunCounts.rows[0]);

  const orphanPayload = { orphan: true, proof: nonce };
  const orphanHash = await dbHash(orphanPayload);
  await client.query(
    'insert into public.preset_payloads_v2(hash, payload_kind, payload) values ($1, $2, $3::jsonb)',
    [orphanHash, 'resolved', asJson(orphanPayload)],
  );
  const orphanBefore = Number(await queryScalar(
    'select count(*)::int from public.preset_payloads_v2 where hash = $1',
    [orphanHash],
  ));
  const purgeReport = await queryJson(
    "select public.kessho_purge_deleted_presets_v2(false, interval '0 seconds', interval '0 seconds', 100) as result",
  );
  const orphanAfter = Number(await queryScalar(
    'select count(*)::int from public.preset_payloads_v2 where hash = $1',
    [orphanHash],
  ));

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'passed',
    transactionRolledBack: true,
    functionsVerified: requiredFunctions,
    save: {
      testName,
      presetId: firstSave?.preset?.id ?? null,
      firstVersionId: firstSave?.version?.id ?? null,
      secondVersionId: secondSave?.version?.id ?? null,
      resolvedHash,
      resolvedPayloadRows,
      activeLegacyRows,
      lastSeenStable: beforeSeen === afterSeen,
    },
    narrowRpc: {
      lookedUpPresetId,
      logicalKeyExistsBeforeRename,
      cardNameBeforeRename: cardBeforeRename?.name ?? null,
      renameResultName: renameResult?.name ?? null,
      oldLogicalKeyExistsAfterRename,
      newLogicalKeyExistsAfterRename,
      renamedLookupId,
      cardNameAfterRename: cardAfterRename?.name ?? null,
    },
    hashVerification: {
      badHashRejected: /Preset payload hash mismatch/i.test(badHashMessage),
      missingHashRejected: /Preset payload hash references missing payload rows/i.test(missingHashMessage),
    },
    purge: {
      dryRunNonMutating,
      dryRunReport,
      orphanHash,
      orphanBefore,
      orphanAfter,
      orphanDeletedInTransaction: orphanBefore === 1 && orphanAfter === 0,
      executionReport: purgeReport,
    },
  };

  if (resolvedPayloadRows !== 1) throw new Error(`Expected one resolved payload row, got ${resolvedPayloadRows}`);
  if (activeLegacyRows !== 0) throw new Error(`Expected zero active legacy rows, got ${activeLegacyRows}`);
  if (!report.save.lastSeenStable) throw new Error('last_seen_at changed on immediate duplicate save');
  if (lookedUpPresetId !== firstSave?.preset?.id) throw new Error('Narrow preset id lookup did not return the saved preset id');
  if (logicalKeyExistsBeforeRename !== true) throw new Error('Narrow logical-key existence check did not find the saved preset');
  if (cardBeforeRename?.id !== firstSave?.preset?.id || cardBeforeRename?.name !== testName) {
    throw new Error('Narrow preset card RPC did not return the saved preset summary');
  }
  if (renameResult?.id !== firstSave?.preset?.id || renameResult?.name !== renamedName) {
    throw new Error('Narrow rename RPC did not return the renamed preset row');
  }
  if (oldLogicalKeyExistsAfterRename !== false) throw new Error('Old logical key still exists after narrow rename');
  if (newLogicalKeyExistsAfterRename !== true) throw new Error('New logical key does not exist after narrow rename');
  if (renamedLookupId !== firstSave?.preset?.id) throw new Error('Narrow id lookup did not find the renamed preset');
  if (cardAfterRename?.name !== renamedName) throw new Error('Narrow card RPC did not return renamed preset summary');
  if (!report.hashVerification.badHashRejected) throw new Error('Bad hash/body pair was not rejected');
  if (!report.hashVerification.missingHashRejected) throw new Error('Missing payload hash was not rejected');
  if (!dryRunNonMutating) throw new Error('Purge dry-run mutated row counts');
  if (!report.purge.orphanDeletedInTransaction) throw new Error('Purge execution did not delete the test orphan payload');

  await client.query('rollback');
  transactionOpen = false;
  printReport(report);
} catch (error) {
  if (transactionOpen) {
    try {
      await client.query('rollback');
    } catch {
      // Ignore rollback failures while reporting the original error.
    }
  }
  throw error;
} finally {
  await client.end().catch(() => {});
}
