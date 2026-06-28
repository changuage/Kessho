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
  'function hasFreshPlayIncrementMarker',
  'function writePlayIncrementMarker',
);
const incrementBody = extractBetween(
  'export async function incrementPresetPlays',
  '/**\n * Get a single preset by ID',
);

const required = [
  'const PLAY_INCREMENT_SESSION_PREFIX',
  'const PLAY_INCREMENT_TTL_MS = 24 * 60 * 60 * 1000',
  'function hasFreshPlayIncrementMarker',
  'function writePlayIncrementMarker',
  'sessionStorage.getItem(storageKey)',
  'previous + PLAY_INCREMENT_TTL_MS > now',
  'return false',
  'sessionStorage.setItem(key, String(now))',
  'if (hasFreshPlayIncrementMarker(storageKey)) return false',
  'await ensureCloudAnonymousSession(client)',
  "client.rpc('increment_plays'",
  'preset_id: presetId',
  'writePlayIncrementMarker(storageKey, Date.now())',
];

const failures = [];
for (const token of required) {
  if (!text.includes(token)) failures.push(`missing ${token}`);
}

const debounceCheck = incrementBody.indexOf('hasFreshPlayIncrementMarker(storageKey)');
const incrementRpc = incrementBody.indexOf("client.rpc('increment_plays'");
if (debounceCheck < 0 || incrementRpc < 0 || debounceCheck > incrementRpc) {
  failures.push('incrementPresetPlays must check the fresh session marker before calling increment_plays');
}

const markerWrite = incrementBody.indexOf('writePlayIncrementMarker(storageKey, Date.now())');
if (markerWrite < 0 || markerWrite < incrementRpc) {
  failures.push('incrementPresetPlays must write the session marker only after increment_plays succeeds');
}

const allIncrementRpcCalls = [...text.matchAll(/client\.rpc\('increment_plays'/g)];
if (allIncrementRpcCalls.length !== 1) {
  failures.push(`expected exactly one increment_plays client RPC call, found ${allIncrementRpcCalls.length}`);
}

if (debounceBody.includes('sessionStorage.setItem')) {
  failures.push('fresh-marker helper must not write session storage before RPC success');
}

if (failures.length) {
  console.error('Cloud play increment guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Cloud play increment guard passed.');
