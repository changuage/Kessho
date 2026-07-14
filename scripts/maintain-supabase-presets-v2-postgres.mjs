#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const outputJson = args.has('--json');
const backup = args.has('--backup');

const tempDir = await mkdtemp(path.join(tmpdir(), 'preset-v2-postgres-maintenance-'));
const outfile = path.join(tempDir, 'preset-v2-postgres-maintenance.mjs');

try {
  await build({
    stdin: {
      contents: `
        import crypto from 'node:crypto';
        import fs from 'node:fs';
        import { createRequire } from 'node:module';
        import path from 'node:path';
        import process from 'node:process';
        import {
          applyRecordPatch,
          canonicalizeRecord,
          getPresetChildSpecs,
          hashCanonicalJson,
          normalizeResolvedVersionData,
        } from './src/presets/presetStorageV2.ts';
        import {
          buildDrumEuclideanStateFromPatternData,
          buildSynthEuclideanStateFromPatternData,
        } from './src/presets/euclideanPatternBank.ts';

        const write = ${JSON.stringify(write)};
        const outputJson = ${JSON.stringify(outputJson)};
        const backup = ${JSON.stringify(backup)};

        function readEnvFile(filePath) {
          if (!fs.existsSync(filePath)) return {};
          return Object.fromEntries(
            fs.readFileSync(filePath, 'utf8')
              .split(/\\r?\\n/)
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

        const env = {
          ...readEnvFile(path.join(process.cwd(), '.env')),
          ...readEnvFile(path.join(process.cwd(), '.env.local')),
          ...process.env,
        };

        const databaseUrl = env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DB_URL;
        if (!databaseUrl) throw new Error('Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.');

        function pgClientConfig(connectionString) {
          const url = new URL(connectionString);
          url.searchParams.delete('sslmode');
          const normalizedConnectionString = url.toString();
          const isLocal = /(?:localhost|127\\.0\\.0\\.1|\\[::1\\])/.test(normalizedConnectionString);
          return {
            connectionString: normalizedConnectionString,
            ssl: isLocal ? false : { rejectUnauthorized: false },
          };
        }

        const require = createRequire(path.join(process.cwd(), 'package.json'));
        const pg = require('pg');
        const client = new pg.Client(pgClientConfig(databaseUrl));

        function key(...parts) {
          return parts.map((part) => part ?? '').join('\\u001f');
        }

        function isPlainObject(value) {
          return typeof value === 'object' && value !== null && !Array.isArray(value);
        }

        function isInternalDerived(row) {
          return String(row.name ?? '').startsWith('__derived__/')
            || (Array.isArray(row.tags) && row.tags.includes('internal-derived'));
        }

        function dateIso(value) {
          if (!value) return null;
          return value instanceof Date ? value.toISOString() : String(value);
        }

        function normalizeRows(rows) {
          return rows.map((row) => Object.fromEntries(
            Object.entries(row).map(([field, value]) => [field, value instanceof Date ? value.toISOString() : value]),
          ));
        }

        function byVersion(left, right) {
          return (left.version_no ?? 0) - (right.version_no ?? 0)
            || String(dateIso(left.created_at) ?? '').localeCompare(String(dateIso(right.created_at) ?? ''));
        }

        function latestVersion(rows) {
          return [...rows].sort(byVersion).at(-1) ?? null;
        }

        function payloadRecord(payloadMap, hash) {
          if (!hash) return null;
          const payload = payloadMap.get(hash);
          return isPlainObject(payload) ? canonicalizeRecord(payload) : null;
        }

        function payloadBytes(payload) {
          return JSON.stringify(payload ?? {}).length;
        }

        function sha256(text) {
          return crypto.createHash('sha256').update(text).digest('hex');
        }

        function writeBackupFile(dir, name, rows) {
          const filePath = path.join(dir, name + '.json');
          const body = JSON.stringify(normalizeRows(rows), null, 2) + '\\n';
          fs.writeFileSync(filePath, body, 'utf8');
          return {
            file: name + '.json',
            rows: Array.isArray(rows) ? rows.length : 0,
            bytes: Buffer.byteLength(body),
            sha256: sha256(body),
          };
        }

        function writePresetBackup(tables) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const dir = path.join(process.cwd(), 'backups', 'supabase-preset-v2-postgres-' + timestamp);
          fs.mkdirSync(dir, { recursive: true });
          const files = Object.entries(tables).map(([name, rows]) => writeBackupFile(dir, name, rows));
          const manifest = {
            createdAt: new Date().toISOString(),
            kind: 'supabase-preset-v2-postgres-logical-json',
            dryRun: !write,
            files,
          };
          const manifestBody = JSON.stringify(manifest, null, 2) + '\\n';
          fs.writeFileSync(path.join(dir, 'manifest.json'), manifestBody, 'utf8');
          return {
            dir,
            manifest: path.join(dir, 'manifest.json'),
            files,
            manifestSha256: sha256(manifestBody),
          };
        }

        async function queryRows(sql, params = []) {
          const result = await client.query(sql, params);
          return result.rows;
        }

        function quoteIdent(value) {
          if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Invalid SQL identifier: ' + value);
          return '"' + value.replaceAll('"', '""') + '"';
        }

        async function updateById(table, id, patch) {
          const entries = Object.entries(patch);
          if (!entries.length) return;
          const assignments = entries.map(([field], index) => quoteIdent(field) + ' = $' + (index + 2)).join(', ');
          await client.query(
            'update public.' + quoteIdent(table) + ' set ' + assignments + ' where id = $1',
            [id, ...entries.map(([, value]) => value)],
          );
        }

        async function updateRefsTarget(loserId, targetId) {
          await client.query(
            'update public.preset_version_refs_v2 set target_preset_id = $1 where target_preset_id = $2',
            [targetId, loserId],
          );
        }

        async function deletePayloads(hashes) {
          if (!hashes.length) return;
          await client.query('delete from public.preset_payloads_v2 where hash = any($1::text[])', [hashes]);
        }

        const payloadTouches = [];
        const payloadUpserts = [];

        async function ensurePayload(payloadByHash, hash, payload, actions) {
          const existing = payloadByHash.get(hash);
          if (existing) {
            actions.payloadsReused += 1;
            if (write) payloadTouches.push(hash);
            return;
          }

          actions.payloadsInserted += 1;
          if (write) payloadUpserts.push({ hash, payload });
          payloadByHash.set(hash, payload);
        }

        await client.connect();

        const presets = await queryRows('select id, owner_key, type::text, scope, name, latest_version_no, latest_version_id, latest_resolved_hash, latest_metadata_hash, updated_at, archived, deleted_at, tags, visibility::text from public.presets_v2 order by id');
        const versions = await queryRows('select id, preset_id, version_no, parent_version_id, storage_mode::text, override_hash, metadata_hash, patch_from_prev_hash, resolved_hash, is_checkpoint, created_at from public.preset_versions_v2 order by preset_id, version_no, id');
        const refs = await queryRows('select version_id, ref_slot, target_preset_id, target_version_no, follow_latest, override_hash, created_at from public.preset_version_refs_v2 order by version_id, ref_slot');
        const contentRefs = await queryRows(
          "select version_id, ref_slot, content_hash, content_type, created_at "
          + "from public.preset_version_content_refs_v2 order by version_id, ref_slot",
        ).catch((error) => String(error?.message ?? error).includes('does not exist') ? [] : Promise.reject(error));
        const payloadRows = await queryRows('select hash, payload_kind, payload, payload_bytes, created_at, last_seen_at from public.preset_payloads_v2 order by hash');

        const backupManifest = (write || backup)
          ? writePresetBackup({
              presets_v2: presets,
              preset_versions_v2: versions,
              preset_version_refs_v2: refs,
              preset_version_content_refs_v2: contentRefs,
              preset_payloads_v2: payloadRows,
            })
          : null;

        const presetById = new Map(presets.map((row) => [row.id, row]));
        const versionsById = new Map(versions.map((row) => [row.id, row]));
        const versionsByPreset = new Map();
        for (const version of versions) {
          const rows = versionsByPreset.get(version.preset_id) ?? [];
          rows.push(version);
          versionsByPreset.set(version.preset_id, rows);
        }
        for (const rows of versionsByPreset.values()) rows.sort(byVersion);
        const refsByVersion = new Map();
        for (const ref of refs) {
          const rows = refsByVersion.get(ref.version_id) ?? [];
          rows.push(ref);
          refsByVersion.set(ref.version_id, rows);
        }
        const contentRefsByVersion = new Map();
        for (const ref of contentRefs) {
          const rows = contentRefsByVersion.get(ref.version_id) ?? [];
          rows.push(ref);
          contentRefsByVersion.set(ref.version_id, rows);
        }
        const payloadByHash = new Map(payloadRows.map((row) => [row.hash, row.payload]));
        const payloadKindByHash = new Map(payloadRows.map((row) => [row.hash, row.payload_kind]));
        const payloadRowByHash = new Map(payloadRows.map((row) => [row.hash, row]));

        const materializedByVersionId = new Map();
        const materializeWarnings = [];

        function latestForPresetId(presetId) {
          return latestVersion(versionsByPreset.get(presetId) ?? []);
        }

        function retainedVisibleGraphPresetIds() {
          const protectedIds = new Set();
          const queue = presets.filter((preset) => (
            preset.latest_version_id
            && !isInternalDerived(preset)
          ));
          while (queue.length > 0) {
            const current = queue.shift();
            if (!current || protectedIds.has(current.id)) continue;
            protectedIds.add(current.id);
            for (const ref of refsByVersion.get(current.latest_version_id) ?? []) {
              const child = presetById.get(ref.target_preset_id);
              if (child && child.latest_version_id) {
                queue.push(child);
              }
            }
          }
          return protectedIds;
        }

        async function materializeVersion(version, stack = new Set()) {
          if (!version) return null;
          if (materializedByVersionId.has(version.id)) return materializedByVersionId.get(version.id);
          if (stack.has(version.id)) {
            materializeWarnings.push({ versionId: version.id, issue: 'cycle_detected' });
            return null;
          }

          const cached = payloadRecord(payloadByHash, version.resolved_hash);
          if (cached) {
            materializedByVersionId.set(version.id, cached);
            return cached;
          }

          const preset = presetById.get(version.preset_id);
          if (!preset) {
            materializeWarnings.push({ versionId: version.id, issue: 'missing_preset' });
            return null;
          }

          stack.add(version.id);
          let mergedFromRefs = {};
          const childSpecs = getPresetChildSpecs(preset.type, preset.scope ?? undefined);
          const mergeableSlots = new Set(childSpecs.map((spec) => spec.slot));
          for (const ref of refsByVersion.get(version.id) ?? []) {
            if (!mergeableSlots.has(ref.ref_slot)) continue;
            const targetPreset = presetById.get(ref.target_preset_id);
            const targetVersion = targetPreset ? latestForPresetId(targetPreset.id) : null;
            let child = targetVersion ? await materializeVersion(targetVersion, stack) : null;
            if (!targetPreset || !child) {
              materializeWarnings.push({ versionId: version.id, refSlot: ref.ref_slot, issue: 'missing_child' });
              continue;
            }
            child = canonicalizeRecord(child);
            if (targetPreset.scope === 'euclideanPattern' && ref.ref_slot === 'euclideanPattern') {
              if (preset.type === 'source' && preset.scope === 'synth') {
                child = canonicalizeRecord(buildSynthEuclideanStateFromPatternData(child));
              } else if (preset.type === 'source' && preset.scope === 'drums') {
                child = canonicalizeRecord(buildDrumEuclideanStateFromPatternData(child));
              }
            }
            const refOverride = payloadRecord(payloadByHash, ref.override_hash);
            if (refOverride) child = canonicalizeRecord({ ...child, ...refOverride });
            mergedFromRefs = canonicalizeRecord({ ...mergedFromRefs, ...child });
          }

          const override = payloadRecord(payloadByHash, version.override_hash) ?? {};
          let base = {};
          if (version.storage_mode === 'patch' && version.patch_from_prev_hash) {
            const parentVersion = version.parent_version_id
              ? versionsById.get(version.parent_version_id)
              : (versionsByPreset.get(version.preset_id) ?? []).filter((row) => row.version_no < version.version_no).at(-1);
            const previous = parentVersion ? await materializeVersion(parentVersion, stack) : null;
            const patch = payloadRecord(payloadByHash, version.patch_from_prev_hash);
            if (!previous || !patch) {
              materializeWarnings.push({ versionId: version.id, issue: !previous ? 'missing_previous' : 'missing_patch' });
              stack.delete(version.id);
              return null;
            }
            base = applyRecordPatch(previous, patch);
          }

          const resolved = normalizeResolvedVersionData(
            preset.type,
            preset.scope ?? undefined,
            canonicalizeRecord({ ...mergedFromRefs, ...base, ...override }),
          );
          materializedByVersionId.set(version.id, resolved);
          stack.delete(version.id);
          return resolved;
        }

        const actions = {
          payloadsInserted: 0,
          payloadsReused: 0,
          versionsResolvedBackfilled: 0,
          versionsResolvedSkipped: 0,
          latestRollupsRepaired: 0,
          duplicateInternalRefsRewired: 0,
          duplicateInternalPresetsArchived: 0,
          unreferencedInternalPresetsArchived: 0,
          unreferencedPayloadsDeleted: 0,
        };

        const versionResolvedPatches = [];
        const versionResolvedSkips = [];
        for (const version of versions) {
          if (version.resolved_hash) continue;
          if ((contentRefsByVersion.get(version.id) ?? []).length > 0) {
            versionResolvedSkips.push({ id: version.id, context: 'graph-authoritative-content-refs' });
            continue;
          }
          const resolved = await materializeVersion(version);
          if (!resolved) {
            const preset = presetById.get(version.preset_id);
            versionResolvedSkips.push({
              id: version.id,
              context: preset ? preset.type + ':' + (preset.scope ?? '') + ':' + preset.name + ':v' + version.version_no : version.id,
            });
            continue;
          }
          const hash = await hashCanonicalJson(resolved);
          await ensurePayload(payloadByHash, hash, resolved, actions);
          versionResolvedPatches.push({ id: version.id, resolved_hash: hash });
          version.resolved_hash = hash;
        }

        actions.versionsResolvedBackfilled = versionResolvedPatches.length;
        actions.versionsResolvedSkipped = versionResolvedSkips.length;

        const latestRollupPatches = [];
        for (const preset of presets) {
          const latest = latestForPresetId(preset.id);
          if (!latest) continue;
          const patch = {
            latest_version_no: latest.version_no,
            latest_version_id: latest.id,
            latest_resolved_hash: latest.resolved_hash ?? null,
            latest_metadata_hash: latest.metadata_hash ?? null,
          };
          if (
            preset.latest_version_no !== patch.latest_version_no
            || preset.latest_version_id !== patch.latest_version_id
            || preset.latest_resolved_hash !== patch.latest_resolved_hash
            || preset.latest_metadata_hash !== patch.latest_metadata_hash
          ) {
            latestRollupPatches.push({ id: preset.id, ...patch });
            Object.assign(preset, patch);
          }
        }
        actions.latestRollupsRepaired = latestRollupPatches.length;

        const activePresets = presets.filter((preset) => preset.deleted_at == null);
        const groupsByLatestResolved = new Map();
        for (const preset of activePresets) {
          if (!preset.latest_resolved_hash) continue;
          const groupKey = key(preset.type, preset.scope, preset.latest_resolved_hash);
          const rows = groupsByLatestResolved.get(groupKey) ?? [];
          rows.push(preset);
          groupsByLatestResolved.set(groupKey, rows);
        }

        const duplicateInternalRewrites = [];
        const archivedPresetIds = new Set();
        for (const group of groupsByLatestResolved.values()) {
          const internalRows = group.filter(isInternalDerived);
          if (!internalRows.length || group.length < 2) continue;
          const canonical = group
            .filter((row) => !isInternalDerived(row) && row.deleted_at == null)
            .sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? '')))[0]
            ?? internalRows.sort((left, right) => String(dateIso(left.updated_at) ?? '').localeCompare(String(dateIso(right.updated_at) ?? '')))[0];
          for (const loser of internalRows) {
            if (!canonical || loser.id === canonical.id) continue;
            duplicateInternalRewrites.push({ loser, canonical });
            archivedPresetIds.add(loser.id);
          }
        }

        const refTargets = new Set(refs.map((ref) => ref.target_preset_id));
        const now = new Date().toISOString();
        const duplicateArchivePatches = [];
        for (const rewrite of duplicateInternalRewrites) {
          const rewired = refs.filter((ref) => ref.target_preset_id === rewrite.loser.id).length;
          actions.duplicateInternalRefsRewired += rewired;
          actions.duplicateInternalPresetsArchived += 1;
          duplicateArchivePatches.push(rewrite);
          for (const ref of refs) {
            if (ref.target_preset_id === rewrite.loser.id) ref.target_preset_id = rewrite.canonical.id;
          }
          refTargets.delete(rewrite.loser.id);
          refTargets.add(rewrite.canonical.id);
        }

        const protectedGraphIds = retainedVisibleGraphPresetIds();
        const unreferencedInternal = presets.filter((preset) => (
          preset.deleted_at == null
          && !archivedPresetIds.has(preset.id)
          && isInternalDerived(preset)
          && !protectedGraphIds.has(preset.id)
        ));
        actions.unreferencedInternalPresetsArchived = unreferencedInternal.length;

        const referencedHashes = new Set();
        for (const version of versions) {
          for (const hash of [version.override_hash, version.metadata_hash, version.patch_from_prev_hash, version.resolved_hash]) {
            if (hash) referencedHashes.add(hash);
          }
        }
        for (const ref of refs) {
          if (ref.override_hash) referencedHashes.add(ref.override_hash);
        }
        for (const ref of contentRefs) referencedHashes.add(ref.content_hash);
        for (const preset of presets) {
          if (preset.latest_resolved_hash) referencedHashes.add(preset.latest_resolved_hash);
          if (preset.latest_metadata_hash) referencedHashes.add(preset.latest_metadata_hash);
        }
        const unreferencedPayloadHashes = payloadRows
          .map((row) => row.hash)
          .filter((hash) => !referencedHashes.has(hash));
        actions.unreferencedPayloadsDeleted = unreferencedPayloadHashes.length;

        if (write) {
          await client.query('begin');
          try {
            await client.query("select set_config('app.kessho_allow_preset_recycle_update', 'on', true)");
            for (const hash of payloadTouches) {
              await client.query('update public.preset_payloads_v2 set last_seen_at = now() where hash = $1', [hash]);
            }
            for (const payload of payloadUpserts) {
              await client.query(
                \`insert into public.preset_payloads_v2(hash, payload_kind, payload)
                 values ($1, 'resolved', $2::jsonb)
                 on conflict (hash) do update set last_seen_at = now()\`,
                [payload.hash, JSON.stringify(payload.payload)],
              );
            }
            for (const patch of versionResolvedPatches) {
              await updateById('preset_versions_v2', patch.id, { resolved_hash: patch.resolved_hash });
            }
            for (const patch of latestRollupPatches) {
              const { id, ...update } = patch;
              await updateById('presets_v2', id, update);
            }
            for (const rewrite of duplicateArchivePatches) {
              if (refs.some((ref) => ref.target_preset_id === rewrite.canonical.id)) {
                await updateRefsTarget(rewrite.loser.id, rewrite.canonical.id);
              }
              await updateById('presets_v2', rewrite.loser.id, {
                archived: true,
                deleted_at: now,
                deleted_by: null,
              });
            }
            for (const preset of unreferencedInternal) {
              await updateById('presets_v2', preset.id, {
                archived: true,
                deleted_at: now,
                deleted_by: null,
              });
            }
            await deletePayloads(unreferencedPayloadHashes);
            await client.query('commit');
          } catch (error) {
            await client.query('rollback');
            throw error;
          }
        }

        const roleByHash = new Map();
        function addRole(hash, role) {
          if (!hash) return;
          const roles = roleByHash.get(hash) ?? new Set();
          roles.add(role);
          roleByHash.set(hash, roles);
        }
        for (const version of versions) {
          addRole(version.override_hash, 'override');
          addRole(version.metadata_hash, 'metadata');
          addRole(version.patch_from_prev_hash, 'patch');
          addRole(version.resolved_hash, 'resolved');
        }
        for (const ref of refs) addRole(ref.override_hash, 'refs_override');
        const payloadKindReuse = [...roleByHash.entries()]
          .filter(([hash, roles]) => roles.size > 1 || (payloadKindByHash.has(hash) && !roles.has(payloadKindByHash.get(hash))))
          .map(([hash, roles]) => ({
            hash: hash.slice(0, 12),
            storedKind: payloadKindByHash.get(hash) ?? 'new',
            roles: [...roles].sort(),
            bytes: payloadRowByHash.get(hash)?.payload_bytes ?? payloadBytes(payloadByHash.get(hash)),
          }))
          .sort((left, right) => right.roles.length - left.roles.length || right.bytes - left.bytes)
          .slice(0, 20);

        const report = {
          dryRun: !write,
          counts: {
            presets: presets.length,
            versions: versions.length,
            refs: refs.length,
            contentRefs: contentRefs.length,
            payloads: payloadRows.length,
          },
          backup: backupManifest,
          actions,
          samples: {
            latestRollups: latestRollupPatches.slice(0, 20).map((row) => ({
              id: row.id,
              latestVersionNo: row.latest_version_no,
              latestResolvedHash: row.latest_resolved_hash?.slice(0, 12) ?? null,
            })),
            resolvedBackfills: versionResolvedPatches.slice(0, 20).map((row) => ({
              id: row.id,
              resolvedHash: row.resolved_hash.slice(0, 12),
            })),
            resolvedBackfillSkips: versionResolvedSkips.slice(0, 20),
            duplicateInternalArchives: duplicateInternalRewrites.slice(0, 20).map(({ loser, canonical }) => ({
              archived: loser.name,
              canonical: canonical.name,
              resolvedHash: loser.latest_resolved_hash?.slice(0, 12) ?? null,
            })),
            unreferencedInternalArchives: unreferencedInternal.slice(0, 20).map((row) => ({
              type: row.type,
              scope: row.scope,
              name: row.name,
            })),
            payloadKindReuse,
            materializeWarnings: materializeWarnings.slice(0, 20),
          },
        };

        if (outputJson) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log('Supabase preset V2 Postgres maintenance ' + (write ? 'write' : 'dry run'));
          console.log('Rows: ' + report.counts.presets + ' presets, ' + report.counts.versions + ' versions, ' + report.counts.refs + ' refs, ' + report.counts.contentRefs + ' content refs, ' + report.counts.payloads + ' payloads');
          if (backupManifest) console.log('Backup: ' + backupManifest.dir);
          console.log('Backfill resolved_hash: ' + actions.versionsResolvedBackfilled + ' versions; payloads inserted ' + actions.payloadsInserted + ', reused ' + actions.payloadsReused);
          if (actions.versionsResolvedSkipped) console.log('Skipped resolved_hash backfill: ' + actions.versionsResolvedSkipped + ' versions');
          console.log('Repair latest rollups: ' + actions.latestRollupsRepaired + ' presets');
          console.log('Collapse duplicate internal-derived: ' + actions.duplicateInternalPresetsArchived + ' archived, ' + actions.duplicateInternalRefsRewired + ' refs rewired');
          console.log('Prune unreferenced internal-derived: ' + actions.unreferencedInternalPresetsArchived + ' archived');
          console.log('Prune unreferenced payloads: ' + actions.unreferencedPayloadsDeleted + ' payloads');
          console.log('Payload-kind reuse intentionally allowed: ' + payloadKindReuse.length + ' sampled groups');
          if (materializeWarnings.length) console.log('Materialize warnings: ' + materializeWarnings.length);
        }

        await client.end();
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['pg'],
    sourcemap: 'inline',
    logLevel: 'silent',
  });

  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
