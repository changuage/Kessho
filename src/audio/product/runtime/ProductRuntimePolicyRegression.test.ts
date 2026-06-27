import assert from 'node:assert/strict';
import { createProductionProductEngine, ProductCoreUnavailableError } from './createProductionProductEngine';
import { createProductRuntimePolicy } from './ProductRuntimePolicy';

function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

withEnv({
  MODE: 'production',
  NODE_ENV: undefined,
  VITE_KESSHO_ENABLE_REFERENCE_RUNTIME: '1',
  VITE_KESSHO_ENABLE_PRODUCT_AB: '1',
}, () => {
  const policy = createProductRuntimePolicy();
  assert.equal(policy.environment, 'production');
  assert.equal(policy.requireProductCore, true);
  assert.equal(policy.allowReferenceRuntime, false);
  assert.equal(policy.allowABComparison, false);
  assert.equal(policy.failClosedOnProductCoreUnavailable, true);
});

withEnv({
  MODE: 'development',
  NODE_ENV: undefined,
  VITE_KESSHO_ENABLE_REFERENCE_RUNTIME: '1',
  VITE_KESSHO_ENABLE_PRODUCT_AB: '1',
}, () => {
  const policy = createProductRuntimePolicy();
  assert.equal(policy.environment, 'development');
  assert.equal(policy.allowReferenceRuntime, true);
  assert.equal(policy.allowABComparison, true);
});

await assert.rejects(
  () => createProductionProductEngine({
    isProductCoreAvailable: async () => false,
    describeUnavailableReason: async () => 'missing wasm module',
  }, {
    environment: 'production',
    requireProductCore: true,
    allowReferenceRuntime: false,
    allowABComparison: false,
    failClosedOnProductCoreUnavailable: true,
  }),
  (error: unknown) => error instanceof ProductCoreUnavailableError &&
    error.code === 'PRODUCT_CORE_UNAVAILABLE' &&
    error.message === 'missing wasm module',
);

console.log('Product runtime policy regression passed');
