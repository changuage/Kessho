#!/usr/bin/env node
import fs from 'node:fs';

const text = fs.readFileSync('src/cloud/supabase.ts', 'utf8');
const saveStart = text.indexOf('export async function saveCloudPreset');
if (saveStart < 0) throw new Error('saveCloudPreset not found');
const saveEnd = text.indexOf('/**\n * Increment play count', saveStart);
const saveBody = text.slice(saveStart, saveEnd < 0 ? undefined : saveEnd);

const required = [
  "client.rpc('kessho_save_preset_v2'",
  'identity_payload',
  'version_payload',
  'payloads_payload',
  'refs_payload',
  'hashCanonicalJson',
  'canonicalizeRecord',
  'const ownerKey = `public:${session.id}`',
  'owner_key: ownerKey',
  'owner_user_id: session.id',
  'if (!session || !UUID_RE.test(session.id)) throw new Error',
];
const forbidden = [
  "client.rpc('kessho_save_legacy_preset'",
  'versions: [{',
  'data: preset.data',
];

const failures = [];
for (const token of required) if (!saveBody.includes(token)) failures.push(`missing ${token}`);
for (const token of forbidden) if (saveBody.includes(token)) failures.push(`forbidden ${token}`);

if (failures.length) {
  console.error('Cloud save V2 contract failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Cloud save V2 contract passed.');
