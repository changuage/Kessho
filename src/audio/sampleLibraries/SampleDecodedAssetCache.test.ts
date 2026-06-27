import assert from 'node:assert/strict';

import { SampleDecodedAssetCache } from './SampleDecodedAssetCache';
import type { SampleAssetDescriptor } from './sampleAssetDescriptors';
import { toDecodedLoopFrames } from './sampleAssetDescriptors';
import type { DecodedCoreProductAsset } from '../coreProductAssets';

function descriptor(assetId: number): SampleAssetDescriptor {
  return {
    assetId,
    url: `/samples/Test/${assetId}.ogg`,
    assetPath: `Test/${assetId}.ogg`,
    libraryKey: 'archive-found-strings-001',
    sampleId: `sample-${assetId}`,
    rootMidi: 60,
    encodedSampleRate: 24000,
  };
}

function decodedAsset(assetId: number, frames: number): DecodedCoreProductAsset {
  return {
    assetId,
    sampleRate: 24000,
    channels: [new Float32Array(frames)],
    flags: 0,
  };
}

const cache = new SampleDecodedAssetCache(1024);
let decodeCalls = 0;
const [first, second] = await Promise.all([
  cache.getOrLoad(descriptor(1), async () => {
    decodeCalls += 1;
    return decodedAsset(1, 8);
  }),
  cache.getOrLoad(descriptor(1), async () => {
    decodeCalls += 1;
    return decodedAsset(1, 8);
  }),
]);
assert.strictEqual(first, second, 'in-flight loads should dedupe by asset id');
assert.equal(decodeCalls, 1, 'loader should run once for concurrent requests');
assert.equal(cache.diagnostics().decodeCount, 1);
assert.equal(cache.diagnostics().hitCount, 1);

const evictingCache = new SampleDecodedAssetCache(32);
await evictingCache.getOrLoad(descriptor(2), async () => decodedAsset(2, 4));
await evictingCache.getOrLoad(descriptor(3), async () => decodedAsset(3, 8));
assert.equal(evictingCache.has(2), false, 'LRU cache should evict oldest non-required asset');
assert.equal(evictingCache.has(3), true, 'newly loaded asset should remain cached');
assert.equal(evictingCache.diagnostics().evictCount, 1);

const loop = toDecodedLoopFrames({
  encodedStartFrame: 2400,
  encodedEndFrame: 4800,
  sourceSampleRate: 48000,
  encodedSampleRate: 24000,
  crossfadeFrames: 240,
}, 48000);
assert.deepEqual(loop, { start: 4800, end: 9600, crossfadeFrames: 480 });
