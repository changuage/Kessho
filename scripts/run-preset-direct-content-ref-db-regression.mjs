#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return [line.slice(0, index), value];
    }));
}

const cwd = process.cwd();
const env = { ...readEnvFile(path.join(cwd, '.env')), ...readEnvFile(path.join(cwd, '.env.local')), ...process.env };
const databaseUrl = env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.');

const url = new URL(databaseUrl);
url.searchParams.delete('sslmode');
const local = /(?:localhost|127\.0\.0\.1|\[::1\])/.test(url.toString());
const client = new Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });
const migrationPath = path.join(cwd, 'supabase/migrations/20260711214902_preset_direct_content_refs_v2.sql');
const migration = fs.readFileSync(migrationPath, 'utf8')
  .replace(/^\s*BEGIN;\s*/i, '')
  .replace(/\s*COMMIT;\s*$/i, '');

const json = value => JSON.stringify(value);
async function hash(payload) {
  const result = await client.query(
    "select encode(extensions.digest(public.kessho_canonical_jsonb_text($1::jsonb), 'sha256'), 'hex') hash",
    [json(payload)],
  );
  return result.rows[0].hash;
}

async function expectError(pattern, callback) {
  await client.query('savepoint expected_error');
  let error;
  try { await callback(); } catch (caught) { error = caught; }
  await client.query('rollback to savepoint expected_error');
  await client.query('release savepoint expected_error');
  if (!error || !pattern.test(String(error.message))) {
    throw new Error(`Expected ${pattern}, received ${error?.message ?? 'success'}`);
  }
}

let transactionOpen = false;
try {
  await client.connect();
  await client.query('begin');
  transactionOpen = true;
  await client.query("set local statement_timeout = '45s'");
  await client.query("set local lock_timeout = '5s'");
  const migrationInstalled = (await client.query(
    "select to_regclass('public.preset_version_content_refs_v2') is not null installed",
  )).rows[0]?.installed === true;
  if (!migrationInstalled) await client.query(migration);

  const users = (await client.query('select id::text from auth.users order by created_at desc nulls last limit 2')).rows.map(row => row.id);
  const user = users[0];
  const otherUser = users[1];
  if (!user || !otherUser) throw new Error('Regression requires two auth.users rows.');
  await client.query(
    "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)",
    [user],
  );

  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const resolved = { regression: nonce };
  const metadata = { name: `__derived__/content-ref-${nonce}` };
  const content = { schemaVersion: 1, contentType: 'sequencerTrigger', content: { pattern: [1, 0, 1, 0] } };
  const drumEndpoint = { schemaVersion: 1, contentType: 'drumKickVoice', content: { frequency: 52, decay: 0.4 } };
  const behaviorContent = {
    schemaVersion: 1,
    contentType: 'parameterBehaviorMap',
    content: { scope: 'granularVoice1', behaviors: { granularV1Blur: { mode: 'walk', range: { min: 0.2, max: 0.8 } } } },
  };
  const resolvedHash = await hash(resolved);
  const metadataHash = await hash(metadata);
  const contentHash = await hash(content);
  const drumEndpointHash = await hash(drumEndpoint);
  const behaviorContentHash = await hash(behaviorContent);
  const identity = {
    type: 'state', scope: null, name: metadata.name, author: 'cloud', library: 'cloud',
    creator: 'Content Ref Regression', visibility: 'private', owner_key: `content-ref:${user}`,
    tags: ['internal-derived'],
  };
  const version = {
    version_no: 1, storage_mode: 'snapshot', resolved_hash: resolvedHash,
    metadata_hash: metadataHash, is_checkpoint: true,
  };
  const payloads = [
    { hash: resolvedHash, payload_kind: 'resolved', payload: resolved },
    { hash: metadataHash, payload_kind: 'metadata', payload: metadata },
    { hash: contentHash, payload_kind: 'content', payload: content },
    { hash: drumEndpointHash, payload_kind: 'content', payload: drumEndpoint },
    { hash: behaviorContentHash, payload_kind: 'content', payload: behaviorContent },
  ];
  const refs = [
    { ref_slot: 'sequencer.synth.1.trigger', content_hash: contentHash, content_type: 'sequencerTrigger' },
    { ref_slot: 'derived.drum.kick.endpoint-a', content_hash: drumEndpointHash, content_type: 'drumKickVoice' },
    { ref_slot: 'behavior.scope.granularvoice1.content', content_hash: behaviorContentHash, content_type: 'parameterBehaviorMap' },
  ];
  const saved = (await client.query(
    'select public.kessho_save_preset_v2($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb) result',
    [json(identity), json(version), json(payloads), '[]', json(refs)],
  )).rows[0].result;
  if (!saved.content_refs?.some(ref => ref.content_hash === contentHash)
      || !saved.content_refs?.some(ref => ref.content_hash === drumEndpointHash)) {
    throw new Error('Atomic save omitted content refs.');
  }
  await client.query(
    "update public.presets_v2 set owner_user_id=$1, owner_key=$2, visibility='private' where id=$3",
    [user, `content-ref:${user}`, saved.preset.id],
  );

  const manifest = (await client.query(
    'select public.kessho_get_preset_latest_manifest_v2($1::uuid) result', [saved.preset.id],
  )).rows[0].result;
  if (!manifest.required_hashes.includes(contentHash)) throw new Error('Manifest omitted content hash.');
  const fetched = (await client.query(
    'select public.kessho_get_missing_preset_payloads_v2($1::text[]) result', [[contentHash]],
  )).rows[0].result;
  if (fetched.length !== 1 || fetched[0].payload_kind !== 'content') throw new Error('Content payload was not readable.');

  const rowCount = Number((await client.query('select count(*)::int count from public.preset_payloads_v2 where hash=$1', [contentHash])).rows[0].count);
  if (rowCount !== 1) throw new Error(`Expected one content row, received ${rowCount}.`);
  await expectError(/must include its canonical payload/, () => client.query(
    'select public.kessho_save_preset_v2($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)',
    [json({ ...identity, name: `${identity.name}-probe` }), json(version), json(payloads.slice(0, 2)), '[]', json(refs)],
  ));

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [otherUser]);
  const unauthorized = (await client.query(
    'select public.kessho_get_missing_preset_payloads_v2($1::text[]) result', [[contentHash]],
  )).rows[0].result;
  if (unauthorized.length !== 0) {
    const diagnostic = (await client.query(
      'select auth.uid()::text uid, owner_user_id::text, owner_key, visibility from public.presets_v2 where id=$1',
      [saved.preset.id],
    )).rows[0];
    throw new Error(`Cross-owner hash probe exposed private content: ${JSON.stringify(diagnostic)}`);
  }

  await client.query('set local role authenticated');
  await expectError(/permission denied/, () => client.query('select * from public.preset_version_content_refs_v2 limit 1'));
  await client.query('reset role');

  const secondIdentity = {
    ...identity,
    name: `${identity.name}-second`,
    owner_key: `content-ref:${otherUser}`,
    owner_user_id: otherUser,
  };
  const secondSave = (await client.query(
    'select public.kessho_save_preset_v2($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb) result',
    [json(secondIdentity), json(version), json(payloads), '[]', json(refs)],
  )).rows[0].result;
  if (!secondSave?.version?.id) throw new Error('Cross-owner deduplicated save failed.');
  const dedupedCount = Number((await client.query(
    'select count(*)::int count from public.preset_payloads_v2 where hash=$1', [contentHash],
  )).rows[0].count);
  if (dedupedCount !== 1) throw new Error(`Cross-owner save created ${dedupedCount} content rows.`);

  await client.query('set local enable_seqscan = off');
  const versionPlan = JSON.stringify((await client.query(
    'explain (format json) select * from public.preset_version_content_refs_v2 where version_id=$1 order by ref_slot',
    [saved.version.id],
  )).rows[0]);
  if (!/preset_version_content_refs_v2_pkey/.test(versionPlan)) {
    throw new Error(`Version content-ref lookup did not use the primary index: ${versionPlan}`);
  }
  const hashPlan = JSON.stringify((await client.query(
    'explain (format json) select version_id from public.preset_version_content_refs_v2 where content_hash=$1',
    [contentHash],
  )).rows[0]);
  if (!/idx_preset_version_content_refs_v2_hash/.test(hashPlan)) {
    throw new Error(`Content-hash reachability lookup did not use its index: ${hashPlan}`);
  }

  await client.query('rollback');
  transactionOpen = false;
  console.log('preset direct content ref database regression passed (transaction rolled back)');
} finally {
  if (transactionOpen) await client.query('rollback').catch(() => {});
  await client.end().catch(() => {});
}
