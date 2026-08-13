import {
  KESSHO_PRODUCT_SCHEMA_HASH,
  KESSHO_PRODUCT_SCHEMA_HASH_HEX,
  KESSHO_PRODUCT_SCHEMA_VERSION,
} from '../generated/kesshoProductSchema';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import type { ProductEngineRuntimeMode } from './ProductRuntimeMode';

export const KESSHO_PRODUCT_ABI_VERSION = 7 as const;

export type ProductRuntimeCapabilityReport = {
  mode: ProductEngineRuntimeMode;
  runtimeKind: 'web-worklet' | 'native' | 'test';
  build: {
    dev: boolean;
    schemaVersion: number;
    schemaHash: number;
    schemaHashHex: string;
    abiVersion: number;
  };
  cpp: {
    abiVersion: number;
    schemaHash: number;
    supportsFullProductGraph: boolean;
    supportsSynthSequencer: boolean;
    supportsDrumSequencer: boolean;
    supportsJourneyMorphClock: boolean;
    supportsHarmonyCore: boolean;
    supportsCoreAssetRendering: boolean;
    supportsNativeBridge: boolean;
    supportsRecordableStems: boolean;
    supportsCpuTelemetry: boolean;
    legacyFallbackCount: number;
    unsupportedMethodCount: number;
  };
  host: {
    diagnostics: ProductRuntimeDiagnostics;
    unsupportedMethods: readonly string[];
    legacyFallbacks: readonly string[];
  };
  release: {
    nativeBridge: 'deferred-for-web-default';
    nativeProductRuntimeGuarded: boolean;
    testProductRuntimeGuarded: boolean;
  };
};

function isDevBuild(): boolean {
  return Boolean((import.meta.env as unknown as { DEV?: boolean }).DEV);
}

export function createWebProductRuntimeCapabilityReport(
  diagnostics: ProductRuntimeDiagnostics,
): ProductRuntimeCapabilityReport {
  return {
    mode: 'core-product',
    runtimeKind: 'web-worklet',
    build: {
      dev: isDevBuild(),
      schemaVersion: KESSHO_PRODUCT_SCHEMA_VERSION,
      schemaHash: KESSHO_PRODUCT_SCHEMA_HASH,
      schemaHashHex: KESSHO_PRODUCT_SCHEMA_HASH_HEX,
      abiVersion: KESSHO_PRODUCT_ABI_VERSION,
    },
    cpp: {
      abiVersion: KESSHO_PRODUCT_ABI_VERSION,
      schemaHash: KESSHO_PRODUCT_SCHEMA_HASH,
      supportsFullProductGraph: true,
      supportsSynthSequencer: true,
      supportsDrumSequencer: true,
      supportsJourneyMorphClock: true,
      supportsHarmonyCore: true,
      supportsCoreAssetRendering: true,
      supportsNativeBridge: false,
      supportsRecordableStems: true,
      supportsCpuTelemetry: true,
      legacyFallbackCount: 0,
      unsupportedMethodCount: 0,
    },
    host: {
      diagnostics,
      unsupportedMethods: ['native-bridge'],
      legacyFallbacks: [],
    },
    release: {
      nativeBridge: 'deferred-for-web-default',
      nativeProductRuntimeGuarded: true,
      testProductRuntimeGuarded: true,
    },
  };
}
