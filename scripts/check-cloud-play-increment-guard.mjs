#!/usr/bin/env node
import fs from 'node:fs';

const text = fs.readFileSync('src/cloud/supabase.ts', 'utf8');

function extractBetween(startToken, endToken) {
  const start = text.indexOf(startToken);
  if (start < 0) throw new Error(`${startToken} not found`);
  const end = text.indexOf(endToken, start);
  return text.slice(start, end < 0 ? undefined : end);
}

const debounceBody = extractBetween(
  'function shouldIncrementPresetPlayThisSession',
  'function getSupabaseErrorText',
);
const incrementBody = extractBetween(
  'export async function incrementPresetPlays',
  '/**\n * Get a single preset by ID',
);

const required = [
  'const PLAY_INCREMENT_SESSION_PREFIX',
  'const PLAY_INCREMENT_TTL_MS = 24 * 60 * 60 * 1000',
  'sessionStorage.getItem(storageKey)',
  'previous + PLAY_INCREMENT_TTL_MS > now',
  'return false',
  'sessionStorage.setItem(storageKey, String(now))',
  'if (!shouldIncrementPresetPlayThisSession(presetId)) return',
  'await ensureCloudAnonymousSession(client)',
  "client.rpc('increment_plays'",
  'preset_id: presetId',
];

const failures = [];
for (const token of required) {
  if (!text.includes(token)) failures.push(`missing ${token}`);
}

const debounceCheck = incrementBody.indexOf('shouldIncrementPresetPlayThisSession(presetId)');
const incrementRpc = incrementBody.indexOf("client.rpc('increment_plays'");
if (debounceCheck < 0 || incrementRpc < 0 || debounceCheck > incrementRpc) {
  failures.push('incrementPresetPlays must check the session debounce before calling increment_plays');
}

const allIncrementRpcCalls = [...text.matchAll(/client\.rpc\('increment_plays'/g)];
if (allIncrementRpcCalls.length !== 1) {
  failures.push(`expected exactly one increment_plays client RPC call, found ${allIncrementRpcCalls.length}`);
}

if (!debounceBody.includes('return true')) {
  failures.push('debounce helper must allow first increment and storage-failure fallback');
}

if (failures.length) {
  console.error('Cloud play increment guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Cloud play increment guard passed.');
