import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { isPointCloudsEmbeddedEngineMode } from '../ui/usePresetPlatformMaintenance';
import {
  isFileOrOpaqueOrigin,
  selectEmbeddedProductCoreAssetUrl,
} from './embeddedProductCoreAssets';

test('embedded Product Core treats file and opaque origins alike', () => {
  assert.equal(isFileOrOpaqueOrigin({ protocol: 'file:', origin: 'null' }), true);
  assert.equal(isFileOrOpaqueOrigin({ protocol: 'https:', origin: 'null' }), true);
  assert.equal(isFileOrOpaqueOrigin({ protocol: 'file:', origin: 'https://example.test' }), true);
  assert.equal(isFileOrOpaqueOrigin({ protocol: 'https:', origin: 'https://example.test' }), false);
  assert.equal(isFileOrOpaqueOrigin(null), false);
});

test('embedded Product Core selects data URLs only for file or opaque origins', () => {
  const blobUrl = 'blob:null/embedded';
  const workletDataUrl = 'data:text/javascript;base64,ZXhwb3J0IHt9';
  const wasmDataUrl = 'data:application/wasm;base64,AGFzbQE=';

  assert.equal(
    selectEmbeddedProductCoreAssetUrl('worklet', blobUrl, workletDataUrl, true),
    workletDataUrl,
  );
  assert.equal(
    selectEmbeddedProductCoreAssetUrl('wasm', blobUrl, wasmDataUrl, true),
    wasmDataUrl,
  );
  assert.equal(
    selectEmbeddedProductCoreAssetUrl('worklet', blobUrl, workletDataUrl, false),
    blobUrl,
  );
  assert.throws(
    () => selectEmbeddedProductCoreAssetUrl('wasm', blobUrl, undefined, true),
    /missing a data URL/,
  );
  assert.throws(
    () => selectEmbeddedProductCoreAssetUrl('worklet', blobUrl, 'blob:null/incorrect', true),
    /missing a data URL/,
  );
});

test('generated embedded asset contract includes both direct-file data URL forms', () => {
  const source = readFileSync('point-clouds/shared/embedded/kessho-product-core-assets.js', 'utf8');
  assert.match(source, /const workletDataUrl = 'data:text\/javascript;base64,' \+ workletBase64/);
  assert.match(source, /const wasmDataUrl = 'data:application\/wasm;base64,' \+ wasmBase64/);
  assert.match(source, /workletDataUrl,\s*wasmUrl,\s*wasmDataUrl,/);
});

test('generated asset fetch shim suppresses file-origin preset manifest probes', async () => {
  const source = readFileSync('point-clouds/shared/embedded/kessho-product-core-assets.js', 'utf8');
  const originalFetchCalls: string[] = [];
  class TestUrl extends URL {
    static createObjectURL(): string {
      return 'blob:null/generated-test';
    }
  }
  const context = vm.createContext({
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    Blob: class Blob {},
    URL: TestUrl,
    Response,
    Promise,
    console,
    location: {
      protocol: 'file:',
      origin: 'file://serialized-origin',
      href: 'file:///point-clouds/alternative-a/index.html',
    },
    fetch: (input: string | { url?: string }) => {
      originalFetchCalls.push(typeof input === 'string' ? input : String(input?.url));
      return Promise.reject(new Error('unexpected file-origin network fetch'));
    },
  });
  (context as unknown as { window: unknown }).window = context;
  vm.runInContext(source, context, { filename: 'kessho-product-core-assets.js' });
  const response = await (context as unknown as {
    fetch: (input: string) => Promise<Response>;
  }).fetch('/presets/manifest.json');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { files: [] });
  assert.deepEqual(originalFetchCalls, []);
});

test('factory preset maintenance can identify the embedded engine guard', () => {
  const previousWindow = globalThis.window;
  try {
    Object.assign(globalThis, { window: { __pointCloudsEmbeddedEngineMode: true } });
    assert.equal(isPointCloudsEmbeddedEngineMode(), true);
    Object.assign(globalThis, { window: { __pointCloudsEmbeddedEngineMode: false } });
    assert.equal(isPointCloudsEmbeddedEngineMode(), false);
  } finally {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.assign(globalThis, { window: previousWindow });
    }
  }
});
