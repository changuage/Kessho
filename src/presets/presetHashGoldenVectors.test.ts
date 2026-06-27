import { PRESET_HASH_ALGORITHM, hashCanonicalJson, stableStringifyCanonical } from './presetStorageV2';

const cases = [
  {
    name: 'object key order',
    left: { b: 2, a: 1 },
    right: { a: 1, b: 2 },
    same: true,
  },
  {
    name: 'undefined object value stripped',
    left: { a: 1, b: undefined },
    right: { a: 1 },
    same: true,
  },
  {
    name: 'array order preserved',
    left: [1, 2],
    right: [2, 1],
    same: false,
  },
  {
    name: 'negative zero normalized',
    left: { value: -0 },
    right: { value: 0 },
    same: true,
  },
  {
    name: 'six decimal rounding',
    left: { value: 0.1234564 },
    right: { value: 0.123456 },
    same: true,
  },
  {
    name: 'negative half rounding matches Math.round',
    left: { value: -0.1234565 },
    right: { value: -0.123456 },
    same: true,
  },
];

export async function runPresetHashGoldenVectors(): Promise<void> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto subtle API is required for preset hash golden vectors.');
  }
  if (PRESET_HASH_ALGORITHM !== 'kessho-preset-json-sha256-v1') {
    throw new Error(`Unexpected preset hash algorithm marker: ${PRESET_HASH_ALGORITHM}`);
  }

  for (const testCase of cases) {
    const leftString = stableStringifyCanonical(testCase.left);
    const rightString = stableStringifyCanonical(testCase.right);
    const leftHash = await hashCanonicalJson(testCase.left);
    const rightHash = await hashCanonicalJson(testCase.right);
    const actuallySame = leftString === rightString && leftHash === rightHash;
    if (actuallySame !== testCase.same) {
      throw new Error(`${testCase.name} parity mismatch: ${JSON.stringify({
        leftString,
        rightString,
        leftHash,
        rightHash,
      })}`);
    }
  }

  const fixedVectors = [
    {
      name: 'object key order',
      value: { b: 2, a: 1 },
      canonical: '{"a":1,"b":2}',
      hash: '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    },
    {
      name: 'undefined object value stripped',
      value: { a: 1, b: undefined },
      canonical: '{"a":1}',
      hash: '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
    },
    {
      name: 'six decimal rounding',
      value: { value: 0.1234564 },
      canonical: '{"value":0.123456}',
      hash: '02c5e03d63426345c67ff0541f6d4a68f212797909119ccd81a94f8f85654811',
    },
    {
      name: 'negative zero normalized',
      value: { value: -0 },
      canonical: '{"value":0}',
      hash: '23d7b286bd429460b92a2a1c21b6afc34110446c5034c17363fda363aa0a7c5d',
    },
    {
      name: 'negative half rounding matches Math.round',
      value: { value: -0.1234565 },
      canonical: '{"value":-0.123456}',
      hash: '4508c786ddc6d8aa1619da1a2b6235eb2c548ca7e47b3b41e51c5f575e7b5b6b',
    },
    {
      name: 'nested array object key order',
      value: { z: [1, true, null, { b: 'x', a: false }] },
      canonical: '{"z":[1,true,null,{"a":false,"b":"x"}]}',
      hash: 'b1a6e1e32adafdfb61c1070c157a15bbe76f1b77af69968c57944f31f22c7251',
    },
  ];

  for (const vector of fixedVectors) {
    const canonical = stableStringifyCanonical(vector.value);
    const hash = await hashCanonicalJson(vector.value);
    if (canonical !== vector.canonical || hash !== vector.hash) {
      throw new Error(`${vector.name} fixed vector mismatch: ${JSON.stringify({
        canonical,
        hash,
        expectedCanonical: vector.canonical,
        expectedHash: vector.hash,
      })}`);
    }
  }
}
