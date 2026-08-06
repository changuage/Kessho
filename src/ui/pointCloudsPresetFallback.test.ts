import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePointCloudsStartPreset } from './pointCloudsPresetFallback';

type TestPreset = {
  name: string;
  source: 'cloud' | 'bundled';
};

const cloudPreset: TestPreset = { name: 'String Waves', source: 'cloud' };
const bundledPreset: TestPreset = { name: 'String Waves', source: 'bundled' };

test('embedded Point Clouds preset wins without cloud or bundled reads', async () => {
  let cloudCalls = 0;
  let bundledCalls = 0;
  const preset = await resolvePointCloudsStartPreset({
    embeddedPreset: bundledPreset,
    presetName: 'String Waves',
    loadCloudPreset: async () => {
      cloudCalls += 1;
      return cloudPreset;
    },
    loadBundledPreset: async () => {
      bundledCalls += 1;
      return bundledPreset;
    },
  });

  assert.equal(preset, bundledPreset);
  assert.equal(cloudCalls, 0);
  assert.equal(bundledCalls, 0);
});

test('Point Clouds prefers a reachable cloud preset', async () => {
  let bundledCalls = 0;
  const preset = await resolvePointCloudsStartPreset({
    presetName: 'String Waves',
    loadCloudPreset: async () => cloudPreset,
    loadBundledPreset: async () => {
      bundledCalls += 1;
      return bundledPreset;
    },
  });

  assert.equal(preset, cloudPreset);
  assert.equal(bundledCalls, 0);
});

test('Point Clouds falls back to bundled String Waves when cloud is unavailable', async () => {
  const cloudErrors = [new Error('cloud disabled'), null];
  for (const cloudError of cloudErrors) {
    const calls: string[] = [];
    const preset = await resolvePointCloudsStartPreset({
      presetName: 'String Waves',
      loadCloudPreset: async () => {
        calls.push('cloud');
        if (cloudError) throw cloudError;
        return null;
      },
      loadBundledPreset: async (name) => {
        calls.push(`bundled:${name}`);
        return bundledPreset;
      },
    });

    assert.equal(preset, bundledPreset);
    assert.deepEqual(calls, ['cloud', 'bundled:String Waves']);
  }
});
