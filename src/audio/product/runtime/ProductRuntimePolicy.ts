export type ProductRuntimeEnvironment = 'production' | 'development' | 'test';

export type ProductRuntimePolicy = {
  readonly environment: ProductRuntimeEnvironment;
  readonly requireProductCore: boolean;
  readonly allowReferenceRuntime: boolean;
  readonly allowABComparison: boolean;
  readonly failClosedOnProductCoreUnavailable: boolean;
};

function readEnv(name: string): string | undefined {
  const processValue = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (processValue !== undefined) return processValue;
  const meta = typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env
    : undefined;
  const metaValue = meta?.[name];
  if (typeof metaValue === 'string') return metaValue;
  if (typeof metaValue === 'boolean') return metaValue ? 'true' : 'false';
  return undefined;
}

function readMode(): ProductRuntimeEnvironment {
  const mode = readEnv('MODE') ?? readEnv('NODE_ENV') ?? 'development';
  if (mode === 'production') return 'production';
  if (mode === 'test') return 'test';
  return 'development';
}

export function createProductRuntimePolicy(): ProductRuntimePolicy {
  const environment = readMode();
  const isProduction = environment === 'production';
  const explicitReference = readEnv('VITE_KESSHO_ENABLE_REFERENCE_RUNTIME') === '1';
  const explicitAB = readEnv('VITE_KESSHO_ENABLE_PRODUCT_AB') === '1';

  return {
    environment,
    requireProductCore: true,
    allowReferenceRuntime: !isProduction && explicitReference,
    allowABComparison: !isProduction && explicitAB,
    failClosedOnProductCoreUnavailable: true,
  };
}

export function assertProductRuntimePolicyAllowsProductCore(policy: ProductRuntimePolicy): void {
  if (!policy.requireProductCore || !policy.failClosedOnProductCoreUnavailable) {
    throw new Error('Product Core runtime policy must require Product Core and fail closed when unavailable.');
  }
}
