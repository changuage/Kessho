import assert from 'node:assert/strict';

import { SampleDecodedAssetCache } from './SampleDecodedAssetCache';
import type { SampleAssetDescriptor } from './sampleAssetDescriptors';
import { toDecodedLoopFrames } from './sampleAssetDescriptors';
import { cloneDecodedCoreProductAssetForTransfer, type DecodedCoreProductAsset } from '../coreProductAssets';

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

const taken = cache.take(1);
assert.strictEqual(taken, first, 'take should return cache ownership without cloning');
assert.equal(cache.has(1), false, 'take should remove the cache entry');
assert.equal(cache.diagnostics().bytesUsed, 0, 'take should remove cached byte accounting');
assert.equal(cache.take(1), null, 'take should not return detached or removed entries twice');

const evictingCache = new SampleDecodedAssetCache(32);
await evictingCache.getOrLoad(descriptor(2), async () => decodedAsset(2, 4));
await evictingCache.getOrLoad(descriptor(3), async () => decodedAsset(3, 8));
assert.equal(evictingCache.has(2), false, 'LRU cache should evict oldest non-required asset');
assert.equal(evictingCache.has(3), true, 'newly loaded asset should remain cached');
assert.equal(evictingCache.diagnostics().evictCount, 1);

const retentionCache = new SampleDecodedAssetCache(128);
await retentionCache.getOrLoad(descriptor(10), async () => decodedAsset(10, 8));
await retentionCache.getOrLoad(descriptor(11), async () => decodedAsset(11, 8));
await retentionCache.getOrLoad(descriptor(12), async () => decodedAsset(12, 8));
const retentionResult = retentionCache.prune({
  requiredAssetIds: new Set([12]),
  activeVoiceAssetIds: new Set([10]),
  targetBytes: 32,
  reason: 'memory-warning',
});
assert.deepEqual(retentionResult.evictedAssetIds, [11], 'memory warning should evict idle unrequired assets first');
assert.deepEqual(retentionResult.deferredAssetIds, [10], 'active voice asset unregister should be deferred');
assert.equal(retentionCache.has(10), true, 'active voice asset should remain cached');
assert.equal(retentionCache.has(12), true, 'required asset should remain cached');
assert.equal(retentionCache.diagnostics().deferredEvictCount, 1);

const backgroundCache = new SampleDecodedAssetCache(128);
await backgroundCache.getOrLoad(descriptor(20), async () => decodedAsset(20, 16));
backgroundCache.prune({
  requiredAssetIds: new Set(),
  activeVoiceAssetIds: new Set(),
  targetBytes: 0,
  reason: 'background',
});
assert.equal(backgroundCache.has(20), false, 'background prune should clear idle assets when target is zero');
await backgroundCache.getOrLoad(descriptor(21), async () => decodedAsset(21, 8));
assert.equal(backgroundCache.has(21), true, 'cache should still load assets after a pressure prune');

const transferCache = new SampleDecodedAssetCache(1024);
const cachedTransferAsset = await transferCache.getOrLoad(descriptor(30), async () => ({
  assetId: 30,
  sampleRate: 24000,
  channels: [new Float32Array([1, 2, 3, 4])],
  flags: 0,
}));
const clonedTransferAsset = cloneDecodedCoreProductAssetForTransfer(cachedTransferAsset);
assert.notStrictEqual(clonedTransferAsset.channels[0], cachedTransferAsset.channels[0], 'transfer clone should not reuse cached channel arrays');
clonedTransferAsset.channels[0]![0] = 99;
assert.equal(cachedTransferAsset.channels[0]![0], 1, 'mutating transfer clone should not mutate cached sample data');
structuredClone(
  { channels: clonedTransferAsset.channels },
  { transfer: clonedTransferAsset.channels.map((channel) => channel.buffer) },
);
assert.equal(clonedTransferAsset.channels[0]!.byteLength, 0, 'structured clone transfer should detach only the transferred clone');
assert.equal(cachedTransferAsset.channels[0]!.byteLength, 16, 'cached sample buffers must remain usable after runtime transfer');
assert.deepEqual([...cachedTransferAsset.channels[0]!], [1, 2, 3, 4], 'cached sample contents must survive runtime transfer');

const loop = toDecodedLoopFrames({
  encodedStartFrame: 2400,
  encodedEndFrame: 4800,
  sourceSampleRate: 48000,
  encodedSampleRate: 24000,
  crossfadeFrames: 240,
}, 48000);
assert.deepEqual(loop, { start: 4800, end: 9600, crossfadeFrames: 480 });
