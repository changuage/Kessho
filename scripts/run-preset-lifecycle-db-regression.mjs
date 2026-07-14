#!/usr/bin/env node
import crypto from 'node:crypto';
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
const migrationPath = path.join(cwd, 'supabase/migrations/20260713205616_preset_graph_lifecycle_integrity_v2.sql');
const migration = fs.readFileSync(migrationPath, 'utf8')
  .replace(/^\s*BEGIN;\s*/i, '')
  .replace(/\s*COMMIT;\s*$/i, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectError(pattern, callback) {
  await client.query('savepoint expected_error');
  let error;
  try {
    await callback();
  } catch (caught) {
    error = caught;
  }
  await client.query('rollback to savepoint expected_error');
  await client.query('release savepoint expected_error');
  if (!error || !pattern.test(String(error.message))) {
    throw new Error(`Expected ${pattern}, received ${error?.message ?? 'success'}`);
  }
}

async function insertPreset({ ownerKey, userId, name, type = 'state', scope = 'global', tags = [], visibility = 'private' }) {
  const result = await client.query(`
    insert into public.presets_v2(
      owner_key, owner_user_id, type, scope, name, author, library,
      creator, tags, visibility, family_name, variant_name
    ) values ($1,$2,$3,$4,$5,'user','cloud','Lifecycle Regression',$6,$7,$5,$5)
    returning id
  `, [ownerKey, userId, type, scope, name, tags, visibility]);
  return result.rows[0].id;
}

async function insertVersion(presetId, versionNo = 1, options = {}) {
  const result = await client.query(`
    insert into public.preset_versions_v2(
      preset_id, version_no, parent_version_id, storage_mode, patch_from_prev_hash,
      resolved_hash, is_checkpoint, note
    ) values ($1,$2,$3,$4,$5,$6,$7,'lifecycle regression')
    returning id
  `, [
    presetId,
    versionNo,
    options.parentVersionId ?? null,
    options.storageMode ?? 'snapshot',
    options.patchHash ?? null,
    options.resolvedHash ?? null,
    options.isCheckpoint ?? true,
  ]);
  return result.rows[0].id;
}

async function markDeleted(presetId, deletedAt = new Date().toISOString()) {
  await client.query("select set_config('app.kessho_allow_preset_recycle_update', 'on', true)");
  await client.query(`
    update public.presets_v2
       set deleted_at=$2, archived=true
     where id=$1
  `, [presetId, deletedAt]);
}

async function payloadHash(payload) {
  const result = await client.query(
    "select encode(extensions.digest(public.kessho_canonical_jsonb_text($1::jsonb), 'sha256'), 'hex') hash",
    [JSON.stringify(payload)],
  );
  return result.rows[0].hash;
}

let transactionOpen = false;
try {
  await client.connect();
  await client.query('begin');
  transactionOpen = true;
  await client.query("set local statement_timeout='90s'");
  await client.query("set local lock_timeout='10s'");

  const installedDefinition = (await client.query(`
    select pg_get_functiondef('public.kessho_prune_internal_derived_v2()'::regprocedure) definition
  `)).rows[0]?.definition ?? '';
  if (!installedDefinition.includes('retained_visible_graph')) {
    await client.query(migration);
  }

  const userId = (await client.query('select id::text from auth.users order by created_at desc nulls last limit 1')).rows[0]?.id;
  if (!userId) throw new Error('Regression requires one auth.users row.');
  await client.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",
    [userId],
  );

  const nonce = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const ownerKey = `lifecycle-regression:${userId}:${nonce}`;

  const hiddenId = await insertPreset({
    ownerKey, userId, name: `__derived__/synth/lifecycle-${nonce}`, type: 'source', scope: 'synth',
    tags: ['internal-derived'],
  });
  const hiddenVersionId = await insertVersion(hiddenId);
  const rootId = await insertPreset({ ownerKey, userId, name: `Lifecycle Root ${nonce}` });
  const rootVersionId = await insertVersion(rootId);
  await client.query(`
    insert into public.preset_version_refs_v2(version_id,ref_slot,target_preset_id)
    values ($1,'synth',$2)
  `, [rootVersionId, hiddenId]);

  const softDeleted = (await client.query(
    'select public.kessho_soft_delete_preset_v2($1::uuid) deleted', [rootId],
  )).rows[0]?.deleted;
  assert(softDeleted === true, 'soft delete should recycle the visible root');
  const hiddenAfterDelete = (await client.query(
    'select deleted_at from public.presets_v2 where id=$1', [hiddenId],
  )).rows[0];
  assert(hiddenAfterDelete?.deleted_at == null, 'retained recycled roots must protect hidden descendants');

  await markDeleted(hiddenId);
  const restored = (await client.query(
    'select public.kessho_restore_preset_v2($1::uuid) restored', [rootId],
  )).rows[0]?.restored;
  assert(restored === true, 'restore should revive a recycled root and hidden descendants');
  const restoredCount = Number((await client.query(
    'select count(*) count from public.presets_v2 where id=any($1::uuid[]) and deleted_at is null',
    [[rootId, hiddenId]],
  )).rows[0].count);
  assert(restoredCount === 2, 'restore left part of the hidden graph recycled');

  const visibleDependencyId = await insertPreset({
    ownerKey, userId, name: `Visible Dependency ${nonce}`, type: 'source', scope: 'synth', tags: [],
  });
  await insertVersion(visibleDependencyId);
  const blockedRootId = await insertPreset({ ownerKey, userId, name: `Blocked Restore Root ${nonce}` });
  const blockedRootVersionId = await insertVersion(blockedRootId);
  await client.query(`
    insert into public.preset_version_refs_v2(version_id,ref_slot,target_preset_id)
    values ($1,'synth',$2)
  `, [blockedRootVersionId, visibleDependencyId]);
  await markDeleted(blockedRootId);
  await markDeleted(visibleDependencyId);
  await expectError(/restore visible dependencies first/, () => client.query(
    'select public.kessho_restore_preset_v2($1::uuid)', [blockedRootId],
  ));
  const blockedRootStillDeleted = (await client.query(
    'select deleted_at is not null deleted from public.presets_v2 where id=$1', [blockedRootId],
  )).rows[0]?.deleted;
  assert(blockedRootStillDeleted === true, 'failed restore must leave the root recycled');

  const orphanId = await insertPreset({
    ownerKey, userId, name: `__derived__/synth/orphan-${nonce}`, type: 'source', scope: 'synth',
    tags: ['internal-derived'],
  });
  await insertVersion(orphanId);
  await client.query('select public.kessho_prune_internal_derived_v2()');
  const orphanDeleted = (await client.query(
    'select deleted_at is not null deleted from public.presets_v2 where id=$1', [orphanId],
  )).rows[0]?.deleted;
  assert(orphanDeleted === true, 'true hidden orphan should enter the recycle bin');

  const patchPayload = { changed: nonce };
  const patchHash = await payloadHash(patchPayload);
  await client.query(`
    insert into public.preset_payloads_v2(hash,payload_kind,payload)
    values ($1,'patch',$2::jsonb)
  `, [patchHash, JSON.stringify(patchPayload)]);
  const patchPresetId = await insertPreset({ ownerKey, userId, name: `Patch Rebase ${nonce}`, type: 'engine', scope: 'pad1' });
  const patchV1 = await insertVersion(patchPresetId);
  const patchV2 = await insertVersion(patchPresetId, 2, {
    parentVersionId: patchV1,
    storageMode: 'patch',
    patchHash,
    isCheckpoint: false,
  });
  await client.query('delete from public.preset_versions_v2 where id=$1', [patchV1]);
  const rebased = (await client.query(`
    select parent_version_id,storage_mode::text,patch_from_prev_hash,is_checkpoint
      from public.preset_versions_v2 where id=$1
  `, [patchV2])).rows[0];
  assert(
    rebased?.parent_version_id == null && rebased?.storage_mode === 'checkpoint'
      && rebased?.patch_from_prev_hash == null && rebased?.is_checkpoint === true,
    'deleting a parent version must rebase the surviving patch row',
  );

  const content = {
    schemaVersion: 1,
    contentType: 'sequencerTrigger',
    content: { steps: [1, 0, 1, 0], nonce },
  };
  const contentHash = await payloadHash(content);
  await client.query(`
    insert into public.preset_payloads_v2(hash,payload_kind,payload)
    values ($1,'content',$2::jsonb)
  `, [contentHash, JSON.stringify(content)]);
  const contentRootId = await insertPreset({ ownerKey, userId, name: `Content Root ${nonce}` });
  const contentRootVersionId = await insertVersion(contentRootId);
  await client.query(`
    insert into public.preset_version_content_refs_v2(version_id,ref_slot,content_hash,content_type)
    values ($1,'sequencer.synth.1.trigger',$2,'sequencerTrigger')
  `, [contentRootVersionId, contentHash]);
  await client.query('select * from public.kessho_run_preset_storage_maintenance_v2(false,1000)');
  const contentSurvived = Number((await client.query(
    'select count(*) count from public.preset_payloads_v2 where hash=$1', [contentHash],
  )).rows[0].count);
  assert(contentSurvived === 1, 'maintenance deleted a payload reachable only through a direct content ref');

  const purgeChildId = await insertPreset({
    ownerKey, userId, name: `__derived__/synth/purge-${nonce}`, type: 'source', scope: 'synth',
    tags: ['internal-derived'],
  });
  await insertVersion(purgeChildId);
  const purgeRootId = await insertPreset({ ownerKey, userId, name: `Purge Root ${nonce}` });
  const purgeRootVersionId = await insertVersion(purgeRootId);
  await client.query(`
    insert into public.preset_version_refs_v2(version_id,ref_slot,target_preset_id)
    values ($1,'synth',$2)
  `, [purgeRootVersionId, purgeChildId]);
  await markDeleted(purgeRootId, '1800-01-01T00:00:00.000Z');
  await client.query(`
    select public.kessho_purge_deleted_presets_v2(
      false, interval '150 years', interval '150 years', 50
    )
  `);
  const purgedRootCount = Number((await client.query(
    'select count(*) count from public.presets_v2 where id=$1', [purgeRootId],
  )).rows[0].count);
  const purgedChildState = (await client.query(
    'select deleted_at is not null deleted from public.presets_v2 where id=$1', [purgeChildId],
  )).rows[0];
  assert(purgedRootCount === 0, 'expired retained root was not hard-purged');
  assert(purgedChildState?.deleted === true, 'hard-purging a root left its hidden child active');

  const definitions = (await client.query(`
    select proname,pg_get_functiondef(oid) definition
      from pg_proc
     where oid in (
       'public.kessho_purge_recycled_presets_v2(boolean,interval,integer)'::regprocedure,
       'public.kessho_run_preset_storage_maintenance_v2(boolean,integer)'::regprocedure
     )
  `)).rows;
  const purgeDefinition = definitions.find(row => row.proname === 'kessho_purge_recycled_presets_v2')?.definition ?? '';
  const maintenanceDefinition = definitions.find(row => row.proname === 'kessho_run_preset_storage_maintenance_v2')?.definition ?? '';
  assert(!purgeDefinition.includes('historical_versions_to_prune'), 'purge still deletes historical owner versions');
  assert(maintenanceDefinition.includes('preset_version_content_refs_v2'), 'maintenance omits direct content reachability');

  const cronCount = Number((await client.query(`
    select count(*) count from cron.job
     where jobname='kessho-v2-lifecycle-maintenance'
       and command='select public.kessho_run_preset_lifecycle_maintenance_v2();'
  `)).rows[0].count);
  assert(cronCount === 1, 'safe preset lifecycle cron is not installed exactly once');

  await client.query('rollback');
  transactionOpen = false;
  console.log('preset lifecycle database regression passed (transaction rolled back)');
} finally {
  if (transactionOpen) await client.query('rollback').catch(() => {});
  await client.end().catch(() => {});
}
