import assert from 'node:assert/strict';
import test from 'node:test';
import { HARMONY_AUDITION_SOURCE_STORAGE_KEY, normalizeHarmonyAuditionSource, readHarmonyAuditionSource, writeHarmonyAuditionSource } from './harmonyAuditionPreference';

test('Harmony audition source survives an unmount/remount through session preference storage', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  writeHarmonyAuditionSource('lead2', storage);
  assert.equal(values.get(HARMONY_AUDITION_SOURCE_STORAGE_KEY), 'lead2');
  assert.equal(readHarmonyAuditionSource(storage), 'lead2');
});

test('invalid or unavailable audition preferences safely fall back to Pad 1', () => {
  assert.equal(normalizeHarmonyAuditionSource('unknown'), 'pad1');
  assert.equal(readHarmonyAuditionSource({ getItem: () => 'sample1', setItem: () => undefined }), 'sample1');
  assert.equal(readHarmonyAuditionSource({ getItem: () => { throw new Error('blocked'); }, setItem: () => undefined }), 'pad1');
});
