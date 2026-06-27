import { WebProductEngine } from '../WebProductEngine';
import {
  assertProductRuntimePolicyAllowsProductCore,
  createProductRuntimePolicy,
  type ProductRuntimePolicy,
} from './ProductRuntimePolicy';

export class ProductCoreUnavailableError extends Error {
  readonly code = 'PRODUCT_CORE_UNAVAILABLE';

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ProductCoreUnavailableError';
  }
}

export type ProductCoreCapabilityProbe = {
  isProductCoreAvailable(): Promise<boolean>;
  describeUnavailableReason?(): Promise<string | undefined>;
};

export async function createProductionProductEngine(
  probe: ProductCoreCapabilityProbe,
  policy: ProductRuntimePolicy = createProductRuntimePolicy(),
): Promise<WebProductEngine> {
  assertProductRuntimePolicyAllowsProductCore(policy);
  const available = await probe.isProductCoreAvailable();
  if (!available) {
    const reason = await probe.describeUnavailableReason?.();
    throw new ProductCoreUnavailableError(
      reason ?? 'Product Core is required but could not be initialized.',
    );
  }
  return new WebProductEngine();
}
