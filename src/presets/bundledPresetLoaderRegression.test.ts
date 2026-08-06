import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBundledPresetByName } from './statePresetRuntime';

const assetPath = resolve('public/presets/StringWaves.json');
const assetBytes = readFileSync(assetPath);
const asset = JSON.parse(assetBytes.toString('utf8')) as {
  id: string;
  name: string;
  timestamp: string;
  currentVersion: number;
  state: Record<string, unknown>;
};

assert.equal(
  createHash('sha256').update(assetBytes).digest('hex'),
  '811c0d02db45c65612c0c66721456c4a9e3629a0a5dd651938515c48571c483c',
  'the bundled fallback must remain the canonical String Waves v17 snapshot',
);

const originalFetch = globalThis.fetch;
const fetchCalls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  fetchCalls.push(url);
  if (url === '/presets/manifest.json') {
    return new Response(JSON.stringify({ files: ['StringWaves.json'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url === '/presets/StringWaves.json') {
    return new Response(assetBytes, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  throw new Error(`unexpected network request while loading local fallback: ${url}`);
}) as typeof fetch;

try {
  const preset = await loadBundledPresetByName('String Waves');
  assert.ok(preset, 'String Waves should load from the local bundled manifest');
  assert.equal(preset.id, asset.id);
  assert.equal(preset.name, 'String Waves');
  assert.equal(preset.timestamp, '2026-07-29T22:23:34.190Z');
  assert.equal(preset.currentVersion, 17);
  assert.equal(preset.source, 'bundled', 'local fallback must not retain cloud provenance');
  assert.deepEqual(preset.state, asset.state, 'local fallback must preserve the materialized state exactly');
  assert.equal(Object.keys(preset.state).length, 1302);
  assert.deepEqual(fetchCalls, ['/presets/manifest.json', '/presets/StringWaves.json']);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Bundled String Waves fallback regression passed');
