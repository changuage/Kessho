import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBundledPresetByName } from './statePresetRuntime';
import { DEFAULT_STATE } from '../ui/state';

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
  '22d24a9e5c2c87e95f6c819740ee60bf758f978f25894a9f1c982b57aebb388f',
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
  assert.deepEqual(
    preset.state,
    {
      ...asset.state,
      shapeLfoSpeed: DEFAULT_STATE.shapeLfoSpeed,
      modulationSourceA: {
        type: 'walk',
        walk: { relationship: 'free', speed: asset.state.randomWalkSpeed },
      },
      modulationSourceB: { type: 'sampleHold' },
    },
    'local fallback must preserve the materialized state and fill additive modulation state',
  );
  assert.equal(Object.keys(preset.state).length, 1329);
  assert.deepEqual(fetchCalls, ['/presets/manifest.json', '/presets/StringWaves.json']);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Bundled String Waves fallback regression passed');
