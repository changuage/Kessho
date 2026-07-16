import assert from 'node:assert/strict';

import { decodeCoreProductAsset, type DecodedCoreProductAsset } from '../../coreProductAssets';
import type { AssetTransferOwnership, CoreProductRuntime } from '../../coreProductRuntime';
import { CoreProductAssetNotReadyError, CoreProductAssetRegistrar } from './CoreProductAssetRegistrar';

const ownerships: AssetTransferOwnership[] = [];
const runtime = {
  audioContext: {} as AudioContext,
  registerAsset: async (_asset: DecodedCoreProductAsset, ownership: AssetTransferOwnership) => {
    ownerships.push(ownership);
  },
  requestAssetRelease: () => {},
  setAssetReleaseCallback: () => {},
  setAssetReleaseFailureCallback: () => {},
} as unknown as CoreProductRuntime;

let activeDecodes = 0;
let maxActiveDecodes = 0;
let decodeCount = 0;
const decode: typeof decodeCoreProductAsset = async (_context, assetId, _url, flags) => {
  decodeCount += 1;
  activeDecodes += 1;
  maxActiveDecodes = Math.max(maxActiveDecodes, activeDecodes);
  await new Promise((resolve) => setTimeout(resolve, 1));
  activeDecodes -= 1;
  return {
    assetId,
    sampleRate: 48000,
    flags,
    channels: [new Float32Array(32)],
  };
};

const state = { sample1Enabled: true };
const registrar = new CoreProductAssetRegistrar(runtime, () => state, true, decode, () => true);
await Promise.all([
  registrar.ensureSampleSlotAssetForNote('sample1', 48, 0.2),
  registrar.ensureSampleSlotAssetForNote('sample1', 60, 0.5),
  registrar.ensureSampleSlotAssetForNote('sample1', 72, 0.8),
]);
assert.ok(decodeCount > 1, 'mobile decode serialization fixture did not request multiple assets');
assert.equal(maxActiveDecodes, 1, 'mobile asset decodes were not serialized');
assert.ok(ownerships.every((ownership) => ownership === 'transfer'), 'mobile decoded assets were cloned instead of transferred');
assert.ok(registrar.hostDecodedBytes() <= 16 * 1024 * 1024, 'mobile host cache exceeded its budget');

let hiddenDecodeCount = 0;
const hiddenDecode: typeof decodeCoreProductAsset = async (...args) => {
  hiddenDecodeCount += 1;
  return decode(...args);
};
const hiddenRegistrar = new CoreProductAssetRegistrar(runtime, () => state, true, hiddenDecode, () => false);
await assert.rejects(
  Promise.all([
    hiddenRegistrar.ensureSampleSlotAssetForNote('sample1', 48, 0.2),
    hiddenRegistrar.ensureSampleSlotAssetForNote('sample1', 60, 0.5),
  ]),
  (error) => error instanceof CoreProductAssetNotReadyError && error.result.reason === 'document-hidden',
  'hidden asset request should report document-hidden instead of silently appearing ready',
);
assert.equal(hiddenDecodeCount, 0, 'hidden document started a fetch/decode operation');
const hiddenEnsureResult = await hiddenRegistrar.ensureDefaultAssetsForState();
assert.equal(hiddenEnsureResult.status, 'not-ready');
assert.equal(hiddenEnsureResult.status === 'not-ready' ? hiddenEnsureResult.reason : null, 'document-hidden');
assert.equal(hiddenRegistrar.backgroundAssetClosure().ready, false, 'hidden document must not report a closed background asset set');
assert.equal(hiddenRegistrar.backgroundAssetClosure().notReadyReason, 'document-hidden');

console.log('Core Product mobile asset policy tests passed');
