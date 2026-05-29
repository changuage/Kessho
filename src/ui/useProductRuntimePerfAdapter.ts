import { useCallback, useEffect, useState } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { CpuOverlayPerfCallback } from './CpuOverlay';
import {
  createProductPerfData,
  readProductRuntimeCpuSummaries,
  summarizeProductRuntimeCpu,
  writeProductRuntimeCpuSummaries,
  type ProductRuntimeCpuSummaries,
} from './productRuntimeUi';

type ProductRuntimePerfAdapter = {
  productRuntimeCpuSummaries: ProductRuntimeCpuSummaries;
  setProductPerfMonitorEnabled: (enabled: boolean) => void;
  setProductPerfUpdateCallback: (callback: CpuOverlayPerfCallback | null) => void;
};

export function useProductRuntimePerfAdapter(
  productRuntimeMode: ProductRuntimeSelectionMode,
  showProductRuntimeSwitcher: boolean,
): ProductRuntimePerfAdapter {
  const [productRuntimeCpuSummaries, setProductRuntimeCpuSummaries] = useState<ProductRuntimeCpuSummaries>(
    () => readProductRuntimeCpuSummaries(),
  );

  const setProductPerfMonitorEnabled = useCallback((enabled: boolean): void => {
    if (productRuntimeMode === 'core-product') {
      productEngine.setPerfMonitorEnabled(enabled);
      return;
    }
    (selectedProductRuntime as unknown as {
      setPerfMonitorEnabled?: (nextEnabled: boolean) => void;
    }).setPerfMonitorEnabled?.(enabled);
  }, [productRuntimeMode]);

  const setProductPerfUpdateCallback = useCallback((callback: CpuOverlayPerfCallback | null): void => {
    if (productRuntimeMode === 'core-product') {
      productEngine.setTelemetryCallback(callback ? (telemetry) => {
        callback(createProductPerfData(telemetry));
      } : null);
      return;
    }
    (selectedProductRuntime as unknown as {
      setPerfUpdateCallback?: (nextCallback: CpuOverlayPerfCallback | null) => void;
    }).setPerfUpdateCallback?.(callback);
  }, [productRuntimeMode]);

  useEffect(() => {
    if (!showProductRuntimeSwitcher) return;

    setProductPerfMonitorEnabled(true);
    setProductPerfUpdateCallback((data) => {
      const summary = summarizeProductRuntimeCpu(data);
      if (!summary) return;
      setProductRuntimeCpuSummaries((prev) => {
        const next = { ...prev, [productRuntimeMode]: summary };
        writeProductRuntimeCpuSummaries(next);
        return next;
      });
    });

    return () => {
      setProductPerfUpdateCallback(null);
      setProductPerfMonitorEnabled(false);
    };
  }, [productRuntimeMode, setProductPerfMonitorEnabled, setProductPerfUpdateCallback, showProductRuntimeSwitcher]);

  return {
    productRuntimeCpuSummaries,
    setProductPerfMonitorEnabled,
    setProductPerfUpdateCallback,
  };
}
