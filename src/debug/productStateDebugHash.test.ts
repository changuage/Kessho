import assert from 'node:assert/strict';

import { fnv1a32Bytes, hashJson, stableStringify } from './productStateDebugHash';

{
  const left = { b: 2, a: { y: true, x: [3, 1] } };
  const right = { a: { x: [3, 1], y: true }, b: 2 };
  assert.equal(stableStringify(left), stableStringify(right), 'stableStringify should sort object keys recursively');
  assert.equal(hashJson(left), hashJson(right), 'object key order should not change Product debug hash');
}

{
  const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
  assert.equal(fnv1a32Bytes(bytes), fnv1a32Bytes(bytes.buffer), 'byte hash should match Uint8Array and ArrayBuffer input');
  assert.equal(fnv1a32Bytes(bytes), '0d396c06', 'byte hash should remain stable for known fixture bytes');
}

{
  const padA = {
    sourceId: 'pad1',
    sourcePresetAId: 1,
    sourcePresetBId: 2,
    morph: 0,
    postLpfHz: 1000,
    attackSeconds: 0.1,
  };
  const padB = {
    ...padA,
    sourcePresetBId: 7,
    postLpfHz: 5000,
    attackSeconds: 0.9,
  };
  assert.notEqual(hashJson(padA), hashJson(padB), 'different source states should produce different debug hashes');
}

console.log('Product state debug hash tests passed');
