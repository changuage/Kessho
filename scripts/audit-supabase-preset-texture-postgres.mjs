#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const outputJson = args.has('--json');
const failOnIssues = args.has('--fail-on-issues');

const tempDir = await mkdtemp(path.join(tmpdir(), 'preset-v2-texture-audit-'));
const outfile = path.join(tempDir, 'preset-v2-texture-audit.mjs');

try {
  await build({
    stdin: {
      contents: `
        import fs from 'node:fs';
        import { createRequire } from 'node:module';
        import path from 'node:path';
        import process from 'node:process';
        import {
          canonicalizeRecord,
          getPresetChildSpecs,
          hashCanonicalJson,
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

        const outputJson = ${JSON.stringify(outputJson)};
        const failOnIssues = ${JSON.stringify(failOnIssues)};

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

        const require = createRequire(import.meta.url);
        const pg = require('pg');
        const client = new pg.Client({
          connectionString: databaseUrl,
          ssl: { rejectUnauthorized: false },
        });

        function key(...parts) {
          return parts.map((part) => part ?? '').join('\\u001f');
        }

        function shortHash(value) {
          return value ? String(value).slice(0, 12) : null;
        }

        function presetLabel(preset) {
          return preset ? preset.type + ':' + (preset.scope ?? '') + ':' + preset.name : '<missing>';
        }

        function versionLabel(preset, version) {
          return presetLabel(preset) + ':v' + (version?.version_no ?? '?');
        }

        function isActivePreset(preset) {
          return preset && preset.deleted_at == null && preset.archived !== true;
        }

        function isInternalDerived(preset) {
          return String(preset?.name ?? '').startsWith('__derived__/')
            || (Array.isArray(preset?.tags) && preset.tags.includes('internal-derived'));
        }

        function payloadRecord(hash) {
          if (!hash) return null;
          const payload = payloadByHash.get(hash);
          return payload && typeof payload === 'object' && !Array.isArray(payload)
            ? canonicalizeRecord(payload)
            : null;
        }

        function payloadKeys(hash) {
          return Object.keys(payloadRecord(hash) ?? {}).sort();
        }

        function keysOutside(keys, allowed) {
          const allowedSet = new Set(allowed);
          return keys.filter((item) => !allowedSet.has(item));
        }

        function keysPresent(keys, candidates) {
          const set = new Set(keys);
          return candidates.filter((item) => set.has(item));
        }

        function countByScope(rows) {
          const counts = {};
          for (const row of rows) {
            const rowKey = row.type + ':' + (row.scope ?? '');
            counts[rowKey] = (counts[rowKey] ?? 0) + 1;
          }
          return counts;
        }

        async function queryRows(sql, params = []) {
          const result = await client.query(sql, params);
          return result.rows;
        }

        await client.connect();

        const presets = await queryRows(
          'select id, owner_key, type::text as type, scope, name, latest_version_no, latest_version_id, latest_resolved_hash, latest_metadata_hash, updated_at, archived, deleted_at, tags, visibility::text as visibility from public.presets_v2 order by id',
        );
        const versions = await queryRows(
          'select id, preset_id, version_no, parent_version_id, storage_mode::text as storage_mode, override_hash, metadata_hash, patch_from_prev_hash, resolved_hash, is_checkpoint, created_at from public.preset_versions_v2 order by preset_id, version_no, id',
        );
        const refs = await queryRows(
          'select version_id, ref_slot, target_preset_id, target_version_no, follow_latest, override_hash, created_at from public.preset_version_refs_v2 order by version_id, ref_slot',
        );
        const payloadRows = await queryRows(
          'select hash, payload_kind::text as payload_kind, payload, payload_bytes, created_at, last_seen_at from public.preset_payloads_v2 order by hash',
        );

        const presetById = new Map(presets.map((row) => [row.id, row]));
        const versionById = new Map(versions.map((row) => [row.id, row]));
        const payloadByHash = new Map(payloadRows.map((row) => [row.hash, row.payload]));
        const payloadRowByHash = new Map(payloadRows.map((row) => [row.hash, row]));
        const refsByVersion = new Map();
        for (const ref of refs) {
          const rows = refsByVersion.get(ref.version_id) ?? [];
          rows.push(ref);
          refsByVersion.set(ref.version_id, rows);
        }

        const activePresets = presets.filter(isActivePreset);
        const activeLatestVersionIds = new Set(activePresets.map((preset) => preset.latest_version_id).filter(Boolean));

        const textureScopeKeys = [
          'source:degrade',
          'kit:dynamicsDrift',
          'kit:dynamicsErosion',
          'source:dynamicsBus',
          'engine:dynamicsEq1',
          'engine:dynamicsEq2',
          'engine:dynamicsSidechain',
          'source:masterFx',
          'engine:dynamicsSaturation',
          'engine:dynamicsEndChain',
        ];

        const hashMismatches = [];
        for (const row of payloadRows) {
          const computed = await hashCanonicalJson(row.payload);
          if (computed !== row.hash) {
            hashMismatches.push({
              hash: shortHash(row.hash),
              computed: shortHash(computed),
              kind: row.payload_kind,
            });
          }
        }

        const uses = [];
        function addUse(hash, role, context) {
          if (hash) uses.push({ hash, role, context });
        }
        for (const version of versions) {
          const preset = presetById.get(version.preset_id);
          const context = versionLabel(preset, version);
          addUse(version.override_hash, 'override', context);
          addUse(version.metadata_hash, 'metadata', context);
          addUse(version.patch_from_prev_hash, 'patch', context);
          addUse(version.resolved_hash, 'resolved', context);
        }
        for (const ref of refs) {
          const ownerVersion = versionById.get(ref.version_id);
          const ownerPreset = ownerVersion ? presetById.get(ownerVersion.preset_id) : null;
          addUse(ref.override_hash, 'refs_override', versionLabel(ownerPreset, ownerVersion) + ':' + ref.ref_slot);
        }
        for (const preset of presets) {
          addUse(preset.latest_resolved_hash, 'latest_resolved_rollup', presetLabel(preset));
          addUse(preset.latest_metadata_hash, 'latest_metadata_rollup', presetLabel(preset));
        }
        const missingPayloadUses = uses.filter((use) => !payloadByHash.has(use.hash));

        const latestRollupIssues = [];
        const activeLatestMissingResolved = [];
        for (const preset of activePresets) {
          const latest = preset.latest_version_id ? versionById.get(preset.latest_version_id) : null;
          if (!latest) {
            if ((preset.latest_version_no ?? 0) > 0) {
              latestRollupIssues.push({ preset: presetLabel(preset), issue: 'missing latest_version_id row' });
            }
            continue;
          }
          if (latest.preset_id !== preset.id) latestRollupIssues.push({ preset: presetLabel(preset), issue: 'latest_version_id points to another preset' });
          if (latest.version_no !== preset.latest_version_no) {
            latestRollupIssues.push({
              preset: presetLabel(preset),
              issue: 'latest version number mismatch',
              presetLatest: preset.latest_version_no,
              versionNo: latest.version_no,
            });
          }
          if (latest.resolved_hash !== preset.latest_resolved_hash) {
            latestRollupIssues.push({
              preset: presetLabel(preset),
              issue: 'latest resolved hash mismatch',
              presetHash: shortHash(preset.latest_resolved_hash),
              versionHash: shortHash(latest.resolved_hash),
            });
          }
          if (latest.metadata_hash !== preset.latest_metadata_hash) {
            latestRollupIssues.push({
              preset: presetLabel(preset),
              issue: 'latest metadata hash mismatch',
              presetHash: shortHash(preset.latest_metadata_hash),
              versionHash: shortHash(latest.metadata_hash),
            });
          }
          if (!latest.resolved_hash) activeLatestMissingResolved.push({ preset: presetLabel(preset), versionNo: latest.version_no });
        }

        const versionResolvedWarnings = versions
          .filter((version) => !version.resolved_hash)
          .map((version) => {
            const preset = presetById.get(version.preset_id);
            return {
              preset: presetLabel(preset),
              versionNo: version.version_no,
              latest: preset?.latest_version_id === version.id,
              storageMode: version.storage_mode,
            };
          });

        const refIssues = [];
        function validateExpectedRefs(parentPreset, expectedSlots, exact) {
          const latest = parentPreset.latest_version_id ? versionById.get(parentPreset.latest_version_id) : null;
          if (!latest) return;
          const latestRefs = refsByVersion.get(latest.id) ?? [];
          const bySlot = new Map();
          for (const ref of latestRefs) {
            const rows = bySlot.get(ref.ref_slot) ?? [];
            rows.push(ref);
            bySlot.set(ref.ref_slot, rows);
          }

          for (const expected of expectedSlots) {
            const rows = bySlot.get(expected.slot) ?? [];
            if (!rows.length) {
              refIssues.push({ preset: presetLabel(parentPreset), slot: expected.slot, issue: 'missing expected latest ref' });
              continue;
            }
            if (rows.length > 1) {
              refIssues.push({ preset: presetLabel(parentPreset), slot: expected.slot, issue: 'duplicate latest refs', count: rows.length });
            }
            for (const ref of rows) {
              const target = presetById.get(ref.target_preset_id);
              if (!target) {
                refIssues.push({ preset: presetLabel(parentPreset), slot: expected.slot, issue: 'target preset missing' });
                continue;
              }
              if (target.type !== expected.type || (target.scope ?? '') !== expected.scope) {
                refIssues.push({
                  preset: presetLabel(parentPreset),
                  slot: expected.slot,
                  issue: 'target scope mismatch',
                  target: presetLabel(target),
                  expected: expected.type + ':' + expected.scope,
                });
              }
              if (!isActivePreset(target)) {
                refIssues.push({ preset: presetLabel(parentPreset), slot: expected.slot, issue: 'target preset inactive', target: presetLabel(target) });
              }
              if (!ref.follow_latest || ref.target_version_no != null) {
                refIssues.push({
                  preset: presetLabel(parentPreset),
                  slot: expected.slot,
                  issue: 'ref is not latest-following',
                  followLatest: ref.follow_latest,
                  targetVersionNo: ref.target_version_no,
                });
              }
            }
          }

          if (exact) {
            const expectedNames = new Set(expectedSlots.map((slot) => slot.slot));
            for (const ref of latestRefs) {
              if (!expectedNames.has(ref.ref_slot)) {
                refIssues.push({ preset: presetLabel(parentPreset), slot: ref.ref_slot, issue: 'unexpected latest ref slot' });
              }
            }
          }
        }

        const stateExpectedSlots = getPresetChildSpecs('state', 'global')
          .filter((slot) => ['degrade', 'dynamicsBus', 'masterFx'].includes(slot.slot))
          .map(({ slot, type, scope }) => ({ slot, type, scope }));
        const sourceRefShapes = [
          {
            type: 'source',
            scope: 'degrade',
            exact: true,
            slots: getPresetChildSpecs('source', 'degrade').map(({ slot, type, scope }) => ({ slot, type, scope })),
          },
          {
            type: 'source',
            scope: 'dynamicsBus',
            exact: true,
            slots: getPresetChildSpecs('source', 'dynamicsBus').map(({ slot, type, scope }) => ({ slot, type, scope })),
          },
          {
            type: 'source',
            scope: 'masterFx',
            exact: true,
            slots: getPresetChildSpecs('source', 'masterFx').map(({ slot, type, scope }) => ({ slot, type, scope })),
          },
        ];

        for (const preset of activePresets) {
          if (preset.type === 'state') {
            validateExpectedRefs(preset, stateExpectedSlots, false);
            continue;
          }
          const shape = sourceRefShapes.find((candidate) => candidate.type === preset.type && candidate.scope === (preset.scope ?? ''));
          if (shape) validateExpectedRefs(preset, shape.slots, shape.exact);
        }

        const legacyStateTextureRefs = [];
        const activeLatestRefsToLegacyDynamics = [];
        for (const preset of activePresets.filter((row) => row.type === 'state')) {
          const latestRefs = refsByVersion.get(preset.latest_version_id) ?? [];
          for (const ref of latestRefs) {
            const target = presetById.get(ref.target_preset_id);
            if (ref.ref_slot === 'dynamics' || (target?.type === 'source' && target?.scope === 'dynamics')) {
              legacyStateTextureRefs.push({
                preset: presetLabel(preset),
                slot: ref.ref_slot,
                target: presetLabel(target),
              });
            }
          }
        }
        for (const ref of refs) {
          if (!activeLatestVersionIds.has(ref.version_id)) continue;
          const target = presetById.get(ref.target_preset_id);
          if (target?.type === 'source' && target.scope === 'dynamics') {
            const ownerVersion = versionById.get(ref.version_id);
            activeLatestRefsToLegacyDynamics.push({
              owner: presetLabel(ownerVersion ? presetById.get(ownerVersion.preset_id) : null),
              slot: ref.ref_slot,
              target: presetLabel(target),
            });
          }
        }

        const duplicateActiveLogicalIdentities = [];
        const logicalGroups = new Map();
        for (const preset of activePresets) {
          const logicalKey = key(preset.owner_key, preset.type, preset.scope, String(preset.name ?? '').trim().toLowerCase());
          const rows = logicalGroups.get(logicalKey) ?? [];
          rows.push(preset);
          logicalGroups.set(logicalKey, rows);
        }
        for (const group of logicalGroups.values()) {
          if (group.length > 1) {
            duplicateActiveLogicalIdentities.push({
              ownerKey: group[0].owner_key,
              type: group[0].type,
              scope: group[0].scope,
              nameKey: String(group[0].name ?? '').trim().toLowerCase(),
              count: group.length,
              ids: group.map((row) => row.id),
            });
          }
        }

        const duplicateLatestGroups = [];
        const latestHashGroups = new Map();
        for (const preset of activePresets) {
          if (!preset.latest_resolved_hash) continue;
          const latestKey = key(preset.type, preset.scope, preset.latest_resolved_hash);
          const rows = latestHashGroups.get(latestKey) ?? [];
          rows.push(preset);
          latestHashGroups.set(latestKey, rows);
        }
        for (const group of latestHashGroups.values()) {
          if (group.length > 1) {
            duplicateLatestGroups.push({
              type: group[0].type,
              scope: group[0].scope,
              resolvedHash: shortHash(group[0].latest_resolved_hash),
              count: group.length,
              names: group.map((row) => row.name).sort(),
            });
          }
        }

        const duplicateInternalLatestGroups = duplicateLatestGroups
          .filter((group) => {
            const fullGroup = activePresets.filter((preset) => (
              preset.type === group.type
              && preset.scope === group.scope
              && shortHash(preset.latest_resolved_hash) === group.resolvedHash
            ));
            return fullGroup.some(isInternalDerived);
          });

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
        const sourceResolvedAllowed = {
          'source:degrade': [...degradeParentKeys, ...DYNAMICS_DRIFT_PRESET_KEYS, ...DYNAMICS_EROSION_PRESET_KEYS],
          'source:dynamicsBus': [...dynamicsBusParentKeys, ...DYNAMICS_EQ1_PRESET_KEYS, ...DYNAMICS_EQ2_PRESET_KEYS, ...DYNAMICS_SIDECHAIN_PRESET_KEYS],
          'source:masterFx': [...masterFxParentKeys, ...DYNAMICS_SATURATION_PRESET_KEYS, ...DYNAMICS_END_CHAIN_PRESET_KEYS],
        };
        const sourceOverrideAllowed = {
          'source:degrade': degradeParentKeys,
          'source:dynamicsBus': dynamicsBusParentKeys,
          'source:masterFx': masterFxParentKeys,
        };
        const leafAllowed = {
          'kit:dynamicsDrift': DYNAMICS_DRIFT_PRESET_KEYS,
          'kit:dynamicsErosion': DYNAMICS_EROSION_PRESET_KEYS,
          'engine:dynamicsEq1': DYNAMICS_EQ1_PRESET_KEYS,
          'engine:dynamicsEq2': DYNAMICS_EQ2_PRESET_KEYS,
          'engine:dynamicsSidechain': DYNAMICS_SIDECHAIN_PRESET_KEYS,
          'engine:dynamicsSaturation': DYNAMICS_SATURATION_PRESET_KEYS,
          'engine:dynamicsEndChain': DYNAMICS_END_CHAIN_PRESET_KEYS,
        };

        const payloadShapeIssues = [];
        const payloadShapeSamples = {};
        function recordSample(scopeKey, preset, resolvedKeys, overrideKeys) {
          if (payloadShapeSamples[scopeKey]) return;
          payloadShapeSamples[scopeKey] = {
            preset: presetLabel(preset),
            resolvedKeys: resolvedKeys.slice(0, 80),
            overrideKeys: overrideKeys.slice(0, 80),
          };
        }

        for (const preset of activePresets) {
          const scopeKey = preset.type + ':' + (preset.scope ?? '');
          if (!textureScopeKeys.includes(scopeKey)) continue;
          const latest = preset.latest_version_id ? versionById.get(preset.latest_version_id) : null;
          const resolvedKeys = payloadKeys(preset.latest_resolved_hash);
          const overrideKeys = latest ? payloadKeys(latest.override_hash) : [];
          recordSample(scopeKey, preset, resolvedKeys, overrideKeys);

          const forbiddenLegacy = keysPresent([...new Set([...resolvedKeys, ...overrideKeys])], legacySidechainTargetKeys);
          if (forbiddenLegacy.length) {
            payloadShapeIssues.push({ preset: presetLabel(preset), issue: 'contains legacy sidechain target preset keys', keys: forbiddenLegacy });
          }
          const legacyCharacterKeys = [...new Set([...resolvedKeys, ...overrideKeys])].filter((item) => item.startsWith('character'));
          if (legacyCharacterKeys.length) {
            payloadShapeIssues.push({ preset: presetLabel(preset), issue: 'contains legacy character keys', keys: legacyCharacterKeys });
          }

          if (sourceResolvedAllowed[scopeKey]) {
            const missingParent = sourceOverrideAllowed[scopeKey].filter((item) => !resolvedKeys.includes(item));
            if (missingParent.length) {
              payloadShapeIssues.push({ preset: presetLabel(preset), issue: 'resolved source payload missing parent keys', keys: missingParent });
            }
            const extraResolved = keysOutside(resolvedKeys, sourceResolvedAllowed[scopeKey]);
            if (extraResolved.length) {
              payloadShapeIssues.push({ preset: presetLabel(preset), issue: 'resolved source payload has keys outside current source graph', keys: extraResolved.slice(0, 40) });
            }
            const extraOverride = keysOutside(overrideKeys, sourceOverrideAllowed[scopeKey]);
            if (extraOverride.length) {
              payloadShapeIssues.push({ preset: presetLabel(preset), issue: 'source override payload has child or foreign keys', keys: extraOverride.slice(0, 40) });
            }
          }

          if (leafAllowed[scopeKey]) {
            const missingLeaf = leafAllowed[scopeKey].filter((item) => !resolvedKeys.includes(item));
            if (missingLeaf.length) {
              payloadShapeIssues.push({ preset: presetLabel(preset), issue: 'leaf resolved payload missing owned keys', keys: missingLeaf.slice(0, 40) });
            }
            const extraLeaf = keysOutside(resolvedKeys, leafAllowed[scopeKey]);
            if (extraLeaf.length) {
              payloadShapeIssues.push({ preset: presetLabel(preset), issue: 'leaf resolved payload has keys outside owned scope', keys: extraLeaf.slice(0, 40) });
            }
          }
        }

        const referencedHashes = new Set(uses.map((use) => use.hash));
        const unreferencedPayloadCount = payloadRows.filter((row) => !referencedHashes.has(row.hash)).length;
        const logicalReferencedBytes = uses.reduce((sum, use) => sum + (payloadRowByHash.get(use.hash)?.payload_bytes ?? 0), 0);
        const uniqueReferencedBytes = [...referencedHashes].reduce((sum, hash) => sum + (payloadRowByHash.get(hash)?.payload_bytes ?? 0), 0);

        const report = {
          counts: {
            presets: presets.length,
            versions: versions.length,
            refs: refs.length,
            payloads: payloadRows.length,
            activePresets: activePresets.length,
          },
          textureCounts: Object.fromEntries(textureScopeKeys.map((scopeKey) => [
            scopeKey,
            {
              active: countByScope(activePresets)[scopeKey] ?? 0,
              total: countByScope(presets)[scopeKey] ?? 0,
            },
          ])),
          integrity: {
            hashMismatchCount: hashMismatches.length,
            hashMismatches: hashMismatches.slice(0, 20),
            missingPayloadUseCount: missingPayloadUses.length,
            missingPayloadUses: missingPayloadUses.slice(0, 20).map((use) => ({ ...use, hash: shortHash(use.hash) })),
            latestRollupIssueCount: latestRollupIssues.length,
            latestRollupIssues: latestRollupIssues.slice(0, 20),
            activeLatestMissingResolvedCount: activeLatestMissingResolved.length,
            activeLatestMissingResolved: activeLatestMissingResolved.slice(0, 20),
            unresolvedVersionWarningCount: versionResolvedWarnings.length,
            unresolvedVersionWarnings: versionResolvedWarnings.slice(0, 30),
            refIssueCount: refIssues.length,
            refIssues: refIssues.slice(0, 40),
            legacyStateTextureRefCount: legacyStateTextureRefs.length,
            legacyStateTextureRefs: legacyStateTextureRefs.slice(0, 20),
            activeLatestRefsToLegacyDynamicsCount: activeLatestRefsToLegacyDynamics.length,
            activeLatestRefsToLegacyDynamics: activeLatestRefsToLegacyDynamics.slice(0, 20),
            payloadShapeIssueCount: payloadShapeIssues.length,
            payloadShapeIssues: payloadShapeIssues.slice(0, 60),
            unreferencedPayloadCount,
          },
          dedupe: {
            duplicateActiveLogicalIdentityCount: duplicateActiveLogicalIdentities.length,
            duplicateActiveLogicalIdentities: duplicateActiveLogicalIdentities.slice(0, 20),
            duplicateLatestGroupCount: duplicateLatestGroups.length,
            duplicateLatestGroups: duplicateLatestGroups.slice(0, 20),
            duplicateInternalLatestGroupCount: duplicateInternalLatestGroups.length,
            duplicateInternalLatestGroups: duplicateInternalLatestGroups.slice(0, 20),
            logicalReferencedBytes,
            uniqueReferencedBytes,
            estimatedSavingsPercent: logicalReferencedBytes
              ? Math.round((1 - uniqueReferencedBytes / logicalReferencedBytes) * 1000) / 10
              : 0,
          },
          samples: {
            payloadShapes: payloadShapeSamples,
          },
        };

        const blockingIssueCount =
          report.integrity.hashMismatchCount
          + report.integrity.missingPayloadUseCount
          + report.integrity.latestRollupIssueCount
          + report.integrity.activeLatestMissingResolvedCount
          + report.integrity.refIssueCount
          + report.integrity.legacyStateTextureRefCount
          + report.integrity.activeLatestRefsToLegacyDynamicsCount
          + report.integrity.payloadShapeIssueCount
          + report.dedupe.duplicateActiveLogicalIdentityCount
          + report.dedupe.duplicateLatestGroupCount;

        if (outputJson) {
          console.log(JSON.stringify({ ...report, blockingIssueCount }, null, 2));
        } else {
          console.log('Supabase preset V2 Texture/Postgres audit');
          console.log('Rows: ' + report.counts.presets + ' presets, ' + report.counts.versions + ' versions, ' + report.counts.refs + ' refs, ' + report.counts.payloads + ' payloads');
          console.log('Active presets: ' + report.counts.activePresets);
          console.log('Dedupe: ' + report.dedupe.estimatedSavingsPercent + '% saved across referenced payload uses');
          console.log('');
          console.log('Texture active counts:');
          for (const [scopeKey, counts] of Object.entries(report.textureCounts)) {
            console.log('- ' + scopeKey + ': ' + counts.active + ' active / ' + counts.total + ' total');
          }
          console.log('');
          console.log('Blocking issues: ' + blockingIssueCount);
          console.log('- hash mismatches: ' + report.integrity.hashMismatchCount);
          console.log('- missing payload uses: ' + report.integrity.missingPayloadUseCount);
          console.log('- latest rollup issues: ' + report.integrity.latestRollupIssueCount);
          console.log('- active latest missing resolved_hash: ' + report.integrity.activeLatestMissingResolvedCount);
          console.log('- Texture ref issues: ' + report.integrity.refIssueCount);
          console.log('- legacy state Texture refs: ' + report.integrity.legacyStateTextureRefCount);
          console.log('- active latest refs to source:dynamics: ' + report.integrity.activeLatestRefsToLegacyDynamicsCount);
          console.log('- Texture payload shape issues: ' + report.integrity.payloadShapeIssueCount);
          console.log('- duplicate active logical identities: ' + report.dedupe.duplicateActiveLogicalIdentityCount);
          console.log('- duplicate latest groups: ' + report.dedupe.duplicateLatestGroupCount);
          console.log('Historical unresolved version warnings: ' + report.integrity.unresolvedVersionWarningCount);

          if (blockingIssueCount > 0) {
            console.log('');
            console.log('Issue samples:');
            for (const issue of [
              ...report.integrity.latestRollupIssues,
              ...report.integrity.refIssues,
              ...report.integrity.payloadShapeIssues,
              ...report.dedupe.duplicateLatestGroups,
            ].slice(0, 12)) {
              console.log('- ' + JSON.stringify(issue));
            }
          }
        }

        await client.end();

        if (failOnIssues && blockingIssueCount > 0) {
          process.exit(1);
        }
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
