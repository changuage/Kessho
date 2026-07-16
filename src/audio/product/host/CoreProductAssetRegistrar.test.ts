import assert from 'node:assert/strict';

import type { DecodedCoreProductAsset } from '../../coreProductAssets';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { AssetTransferOwnership } from '../../coreProductRuntime';
import { CoreProductAssetRegistrar } from './CoreProductAssetRegistrar';

let releaseComplete: (assetId: number) => void = () => { throw new Error('release callback was not installed'); };
let releaseFailed: (assetId: number, result: number) => void = () => { throw new Error('release failure callback was not installed'); };
const releaseRequests: number[] = [];
const registrations: number[] = [];
const ownerships: AssetTransferOwnership[] = [];
const runtime = {
  audioContext: null,
  registerAsset: async (asset: DecodedCoreProductAsset, ownership: AssetTransferOwnership) => {
    registrations.push(asset.assetId);
    ownerships.push(ownership);
  },
  requestAssetRelease: (assetId: number) => releaseRequests.push(assetId),
  setAssetReleaseCallback: (callback: ((assetId: number) => void) | null) => {
    if (callback) releaseComplete = callback;
  },
  setAssetReleaseFailureCallback: (callback: ((assetId: number, result: number) => void) | null) => {
    if (callback) releaseFailed = callback;
  },
} as unknown as CoreProductRuntime;

const registrar = new CoreProductAssetRegistrar(runtime, () => null);
const asset: DecodedCoreProductAsset = {
  assetId: 77,
  sampleRate: 48000,
  flags: 8,
  channels: [new Float32Array(32), new Float32Array(32)],
};

await registrar.registerAsset(asset);
assert.deepEqual(registrations, [77]);
assert.deepEqual(ownerships, ['retain-host-copy'], 'desktop registration should retain the host cache copy');
assert.equal(registrar.registeredDecodedAssetByteLength(), 256);
registrar.unregisterAsset(77);
assert.deepEqual(releaseRequests, [77]);
assert.equal(registrar.registeredDecodedAssetByteLength(), 256, 'pending release changed byte accounting early');
await assert.rejects(registrar.registerAsset(asset), /already registered or pending release/);
releaseComplete(77);
assert.equal(registrar.registeredDecodedAssetByteLength(), 0, 'release completion did not update byte accounting');

await registrar.registerAsset(asset);
registrar.unregisterAsset(77);
releaseFailed(77, -8);
assert.equal(registrar.registeredDecodedAssetByteLength(), 256, 'failed release removed registered byte accounting');
assert.equal(registrar.backgroundAssetClosure().ready, false, 'failed release must invalidate background asset readiness');
assert.equal(registrar.backgroundAssetClosure().notReadyReason, 'release-failed');

const mobileRegistrar = new CoreProductAssetRegistrar(runtime, () => null, true);
await mobileRegistrar.registerAsset({ ...asset, assetId: 78 });
assert.equal(ownerships[ownerships.length - 1], 'transfer', 'mobile registration should transfer original decoded arrays');

console.log('Core Product asset registrar release tests passed');
