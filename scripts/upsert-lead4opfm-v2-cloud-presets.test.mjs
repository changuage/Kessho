import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  createCanonicalLead4opFMResolvedData,
  hashCanonicalJson,
} from './upsert-lead4opfm-v2-cloud-presets.mjs';

const presetBank = JSON.parse(
  readFileSync(new URL('../src/audio/lead4opfmV2PresetBank.json', import.meta.url), 'utf8'),
);

test('Lead4op cloud upsert writes the canonical runtime envelope and hashes it deterministically', () => {
  const source = structuredClone(presetBank[0]);
  source.runtimeOnly = { transient: true };

  const resolved = createCanonicalLead4opFMResolvedData(source);

  assert.deepEqual(Object.keys(resolved), ['format', 'formatVersion', 'preset']);
  assert.equal(resolved.format, 'kessho-lead4opfm-preset');
  assert.equal(resolved.formatVersion, 1);
  assert.equal(resolved.preset.id, source.id);
  assert.equal('_notes' in resolved.preset, false);
  assert.equal('_engineSchemaVersion' in resolved.preset, false);
  assert.equal('runtimeOnly' in resolved.preset, false);

  const withDifferentEditorialMetadata = structuredClone(source);
  withDifferentEditorialMetadata._notes = 'does not belong in persisted runtime payload';
  withDifferentEditorialMetadata._notes_v2 = 'also omitted';
  withDifferentEditorialMetadata.runtimeOnly = 456;
  assert.equal(
    hashCanonicalJson(resolved),
    hashCanonicalJson(createCanonicalLead4opFMResolvedData(withDifferentEditorialMetadata)),
  );
});
