#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const workletPath = resolve(root, 'public/worklets/kessho-core-product.worklet.js');
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const versionPath = resolve(root, 'src/audio/generated/coreProductRuntimeAssetVersion.ts');
const embeddedAssetsPath = resolve(root, 'point-clouds/shared/embedded/kessho-product-core-assets.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJsonString(source, name) {
  const match = source.match(new RegExp(`const ${name} = ("(?:\\\\.|[^"\\\\])*");`));
  assert(match, `Embedded Product assets are missing ${name}`);
  return JSON.parse(match[1]);
}

const worklet = readFileSync(workletPath);
const wasm = readFileSync(wasmPath);
const versionSource = readFileSync(versionPath, 'utf8');
const embeddedSource = readFileSync(embeddedAssetsPath, 'utf8');
const expectedVersion = createHash('sha256')
  .update('public/worklets/kessho-core-product.worklet.js')
  .update('\0')
  .update(worklet)
  .update('\0')
  .update('public/worklets/kessho_core.wasm')
  .update('\0')
  .update(wasm)
  .update('\0')
  .digest('hex')
  .slice(0, 16);
const version = versionSource.match(/CORE_PRODUCT_RUNTIME_ASSET_VERSION = '([a-f0-9]+)'/)?.[1];
assert(version === expectedVersion, `Product runtime cache version is stale: expected ${expectedVersion}, got ${version ?? 'missing'}`);

const embeddedWorklet = Buffer.from(readJsonString(embeddedSource, 'workletSource'));
const embeddedWasmBase64 = readJsonString(embeddedSource, 'wasmBase64');
const embeddedWasm = Buffer.from(embeddedWasmBase64, 'base64');
assert(Buffer.compare(embeddedWorklet, worklet) === 0, 'Embedded Product worklet is stale; run npm run point-clouds:embedded:generate');
assert(Buffer.compare(embeddedWasm, wasm) === 0, 'Embedded Product WASM is stale; run npm run point-clouds:embedded:generate');

console.log(`Product runtime assets are fresh (${expectedVersion})`);
