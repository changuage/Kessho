#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const outputJson = args.has('--json');
const useAnon = args.has('--anon');
const allowAnonWrite = args.has('--allow-anon-write');

const tempDir = await mkdtemp(path.join(tmpdir(), 'preset-v2-texture-repair-'));
const outfile = path.join(tempDir, 'preset-v2-texture-repair.mjs');

try {
  await build({
    stdin: {
      contents: `
        import { createClient } from '@supabase/supabase-js';
        import fs from 'node:fs';
        import path from 'node:path';
        import process from 'node:process';
        import { getVersionData } from './src/presets/codec.ts';
        import { SupabasePresetStore } from './src/presets/SupabasePresetStore.ts';
        import {
          extractPresetVersionMetadata,
          getPresetScope,
        } from './src/presets/presetUtils.ts';
        import {
          canonicalizeRecord,
          getPresetChildSpecs,
        } from './src/presets/presetStorageV2.ts';
        import {
          DYNAMICS_DRIFT_PRESET_KEYS,
          DYNAMICS_EQ1_PRESET_KEYS,
          DYNAMICS_EQ2_PRESET_KEYS,
          DYNAMICS_EROSION_PRESET_KEYS,
          DYNAMICS_END_CHAIN_PRESET_KEYS,
          DYNAMICS_SATURATION_PRESET_KEYS,
          DYNAMICS_SIDECHAIN_PRESET_KEYS,
        } from './src/ui/dynamics/dynamicsPresets.ts';

        const write = ${JSON.stringify(write)};
        const outputJson = ${JSON.stringify(outputJson)};
        const useAnon = ${JSON.stringify(useAnon)};
        const allowAnonWrite = ${JSON.stringify(allowAnonWrite)};

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

        const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
        const anonKey = env.VITE_SUPABASE_ANON_KEY;
        const supabaseKey = useAnon ? anonKey : (serviceRoleKey ?? anonKey);
        if (!supabaseUrl || !supabaseKey) {
          throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL and a Supabase key.');
        }
        if (write && useAnon && !allowAnonWrite) {
          throw new Error('Refusing authenticated anon write without --allow-anon-write.');
        }
        if (write && !useAnon && !serviceRoleKey) {
          throw new Error('Refusing write without SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, or --anon --allow-anon-write.');
        }

        const client = createClient(supabaseUrl, supabaseKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const store = new SupabasePresetStore(client);
        store.setUserId(null, true);
        if (useAnon) {
          const { data, error } = await client.auth.signInAnonymously();
          if (error) throw new Error('Anonymous auth failed: ' + error.message);
          store.setUserId(data.user?.id ?? null, true);
        }

        const legacySidechainTargetKeys = [
          'sidechainDelayATarget',
          'sidechainDelayBTarget',
          'sidechainGranularTarget',
          'sidechainLead1Target',
          'sidechainLead2Target',
          'sidechainPad1Target',
          'sidechainPad2Target',
          'sidechainPianoTarget',
          'sidechainReverbTarget',
        ];
        const degradeParentKeys = ['degradeEnabled', 'degradeHp', 'degradeLp', 'driftEnabled', 'erosionEnabled'];
        const dynamicsBusParentKeys = ['dynamicsBusEnabled', 'dynamicsEq1Enabled', 'dynamicsEq2Enabled', 'sidechainEnabled'];
        const masterFxParentKeys = ['dynamicsSaturationEnabled', 'endCompEnabled'];
        const leafAllowed = {
          'kit:dynamicsDrift': DYNAMICS_DRIFT_PRESET_KEYS,
          'kit:dynamicsErosion': DYNAMICS_EROSION_PRESET_KEYS,
          'engine:dynamicsEq1': DYNAMICS_EQ1_PRESET_KEYS,
          'engine:dynamicsEq2': DYNAMICS_EQ2_PRESET_KEYS,
          'engine:dynamicsSidechain': DYNAMICS_SIDECHAIN_PRESET_KEYS,
          'engine:dynamicsSaturation': DYNAMICS_SATURATION_PRESET_KEYS,
          'engine:dynamicsEndChain': DYNAMICS_END_CHAIN_PRESET_KEYS,
        };
        const sourceAllowed = {
          'source:degrade': [...degradeParentKeys, ...DYNAMICS_DRIFT_PRESET_KEYS, ...DYNAMICS_EROSION_PRESET_KEYS],
          'source:dynamicsBus': [...dynamicsBusParentKeys, ...DYNAMICS_EQ1_PRESET_KEYS, ...DYNAMICS_EQ2_PRESET_KEYS, ...DYNAMICS_SIDECHAIN_PRESET_KEYS],
          'source:masterFx': [...masterFxParentKeys, ...DYNAMICS_SATURATION_PRESET_KEYS, ...DYNAMICS_END_CHAIN_PRESET_KEYS],
        };

        function scopeKey(rowOrEntry) {
          const scope = rowOrEntry.scope ?? getPresetScope(rowOrEntry, rowOrEntry.type) ?? '';
          return rowOrEntry.type + ':' + scope;
        }

        function compactRow(row) {
          return {
            id: row.id,
            type: row.type,
            scope: row.scope,
            name: row.name,
            latestVersionNo: row.latest_version_no,
          };
        }

        function pickKeys(data, keys) {
          const allowed = new Set(keys);
          const next = {};
          for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              next[key] = data[key];
            }
          }
          return canonicalizeRecord(next);
        }

        function shapeDelta(data, keys) {
          const allowed = new Set(keys);
          const dataKeys = Object.keys(data).sort();
          return {
            extra: dataKeys.filter((key) => !allowed.has(key)),
            missing: keys.filter((key) => !Object.prototype.hasOwnProperty.call(data, key)),
          };
        }

        async function fetchActiveRows(type, scope) {
          let query = client
            .from('presets_v2')
            .select('id,type,scope,name,latest_version_no,latest_version_id,archived,deleted_at')
            .eq('type', type)
            .eq('archived', false)
            .is('deleted_at', null)
            .gt('latest_version_no', 0)
            .order('updated_at', { ascending: true });
          if (scope) query = query.eq('scope', scope);
          else query = query.is('scope', null);

          const { data, error } = await query;
          if (error) throw new Error('Active preset fetch failed for ' + type + ':' + (scope ?? '') + ': ' + error.message);
          return data ?? [];
        }

        async function fetchLatestRefSlots(versionId) {
          if (!versionId) return [];
          const { data, error } = await client
            .from('preset_version_refs_v2')
            .select('ref_slot,target_preset_id')
            .eq('version_id', versionId);
          if (error) throw new Error('Latest ref fetch failed: ' + error.message);
          return data ?? [];
        }

        async function loadEntry(row) {
          const entry = await store.load(row.type, row.name, row.scope ?? undefined);
          const data = entry ? getVersionData(entry) : null;
          if (!entry || !data) {
            throw new Error('Could not load current preset data for ' + row.type + ':' + (row.scope ?? '') + ':' + row.name);
          }
          return { entry, data: canonicalizeRecord(data) };
        }

        async function appendRepairVersion(entry, data, note) {
          const nextVersion = Math.max(0, ...entry.versions.map((version) => version.v)) + 1;
          if (!write) return { fromVersion: entry.currentVersion, toVersion: nextVersion, written: false };

          const timestamp = Date.now();
          const currentVersion = entry.versions.find((version) => version.v === entry.currentVersion)
            ?? entry.versions[entry.versions.length - 1];
          const metadata = currentVersion ? extractPresetVersionMetadata(currentVersion) : null;
          entry.versions.push({
            v: nextVersion,
            note,
            timestamp,
            data,
            ...(metadata || {}),
          });
          entry.currentVersion = nextVersion;
          entry.updatedAt = timestamp;
          if (entry.library !== 'stock') entry.library = 'cloud';
          await store.save(entry);
          const reloaded = await store.load(entry.type, entry.name, entry.scope);
          return {
            fromVersion: currentVersion?.v ?? null,
            toVersion: reloaded?.currentVersion ?? nextVersion,
            written: true,
          };
        }

        async function repairLeafRows(report) {
          for (const [targetScopeKey, allowedKeys] of Object.entries(leafAllowed)) {
            const [type, scope] = targetScopeKey.split(':');
            const rows = await fetchActiveRows(type, scope);
            for (const row of rows) {
              try {
                const { entry, data } = await loadEntry(row);
                const delta = shapeDelta(data, allowedKeys);
                const legacyKeys = delta.extra.filter((key) => legacySidechainTargetKeys.includes(key) || key.startsWith('character'));
                if (!delta.extra.length && !delta.missing.length) {
                  report.leaf.skippedClean += 1;
                  continue;
                }
                const sanitized = pickKeys(data, allowedKeys);
                const version = await appendRepairVersion(
                  entry,
                  sanitized,
                  'Texture preset payload ownership repair',
                );
                report.leaf.rows.push({
                  ...compactRow(row),
                  extra: delta.extra,
                  missing: delta.missing,
                  legacyKeys,
                  ...version,
                });
                if (version.written) report.leaf.written += 1;
                else report.leaf.wouldWrite += 1;
              } catch (error) {
                report.errors.push({
                  phase: 'leaf',
                  row: compactRow(row),
                  message: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }
        }

        async function repairSourceRows(report) {
          for (const [targetScopeKey, allowedKeys] of Object.entries(sourceAllowed)) {
            const [type, scope] = targetScopeKey.split(':');
            const rows = await fetchActiveRows(type, scope);
            const expectedSlots = getPresetChildSpecs(type, scope).map((spec) => spec.slot).sort();
            for (const row of rows) {
              try {
                const { entry, data } = await loadEntry(row);
                const sanitized = pickKeys(data, allowedKeys);
                const delta = shapeDelta(data, allowedKeys);
                const refRows = await fetchLatestRefSlots(row.latest_version_id);
                const refSlots = [...new Set(refRows.map((ref) => ref.ref_slot))].sort();
                const missingSlots = expectedSlots.filter((slot) => !refSlots.includes(slot));
                const unexpectedSlots = refSlots.filter((slot) => !expectedSlots.includes(slot));
                if (!delta.extra.length && !delta.missing.length && !missingSlots.length && !unexpectedSlots.length) {
                  report.source.skippedClean += 1;
                  continue;
                }
                const version = await appendRepairVersion(
                  entry,
                  sanitized,
                  'Texture source child graph repair',
                );
                report.source.rows.push({
                  ...compactRow(row),
                  extra: delta.extra,
                  missing: delta.missing,
                  beforeRefSlots: refSlots,
                  missingSlots,
                  unexpectedSlots,
                  ...version,
                });
                if (version.written) report.source.written += 1;
                else report.source.wouldWrite += 1;
              } catch (error) {
                report.errors.push({
                  phase: 'source',
                  row: compactRow(row),
                  message: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }
        }

        async function repairStateRows(report) {
          const rows = await fetchActiveRows('state', 'global');
          const expectedSlots = getPresetChildSpecs('state', 'global')
            .filter((spec) => ['degrade', 'dynamicsBus', 'masterFx'].includes(spec.slot))
            .map((spec) => spec.slot)
            .sort();
          for (const row of rows) {
            try {
              const refRows = await fetchLatestRefSlots(row.latest_version_id);
              const refSlots = [...new Set(refRows.map((ref) => ref.ref_slot))].sort();
              const missingSlots = expectedSlots.filter((slot) => !refSlots.includes(slot));
              const legacyDynamicsSlots = refSlots.filter((slot) => slot === 'dynamics');
              if (!missingSlots.length && !legacyDynamicsSlots.length) {
                report.state.skippedClean += 1;
                continue;
              }
              const { entry, data } = await loadEntry(row);
              const version = await appendRepairVersion(
                entry,
                data,
                'Texture state child graph repair',
              );
              report.state.rows.push({
                ...compactRow(row),
                beforeRefSlots: refSlots,
                missingSlots,
                legacyDynamicsSlots,
                ...version,
              });
              if (version.written) report.state.written += 1;
              else report.state.wouldWrite += 1;
            } catch (error) {
              report.errors.push({
                phase: 'state',
                row: compactRow(row),
                message: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        const report = {
          dryRun: !write,
          canWrite: write,
          leaf: { wouldWrite: 0, written: 0, skippedClean: 0, rows: [] },
          source: { wouldWrite: 0, written: 0, skippedClean: 0, rows: [] },
          state: { wouldWrite: 0, written: 0, skippedClean: 0, rows: [] },
          errors: [],
        };

        await repairLeafRows(report);
        await repairSourceRows(report);
        await repairStateRows(report);

        if (outputJson) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log('Supabase preset V2 Texture repair ' + (write ? 'write' : 'dry run'));
          console.log('Leaf rows: ' + (write ? report.leaf.written : report.leaf.wouldWrite) + '; skipped clean ' + report.leaf.skippedClean);
          console.log('Source rows: ' + (write ? report.source.written : report.source.wouldWrite) + '; skipped clean ' + report.source.skippedClean);
          console.log('State rows: ' + (write ? report.state.written : report.state.wouldWrite) + '; skipped clean ' + report.state.skippedClean);
          console.log('Errors: ' + report.errors.length);
          for (const error of report.errors.slice(0, 10)) {
            console.log('- ' + JSON.stringify(error));
          }
        }

        if (report.errors.length > 0) process.exit(1);
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'silent',
  });

  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
