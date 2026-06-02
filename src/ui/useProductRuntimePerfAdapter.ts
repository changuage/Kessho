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
import { useDocumentVisibility } from './hooks/useDocumentVisibility';

type ProductRuntimePerfAdapter = {
  productRuntimeCpuSummaries: ProductRuntimeCpuSummaries;
  setProductPerfMonitorEnabled: (enabled: boolean) => void;
  setProductPerfUpdateCallback: (callback: CpuOverlayPerfCallback | null) => void;
};

export function useProductRuntimePerfAdapter(
  productRuntimeMode: ProductRuntimeSelectionMode,
  showProductRuntimeSwitcher: boolean,
): ProductRuntimePerfAdapter {
  const documentVisible = useDocumentVisibility();
  const [productRuntimeCpuSummaries, setProductRuntimeCpuSummaries] = useState<ProductRuntimeCpuSummaries>(
    () => readProductRuntimeCpuSummaries(),
  );

  const setProductPerfMonitorEnabled = useCallback((enabled: boolean): void => {
    const nextEnabled = enabled && documentVisible;
    if (productRuntimeMode === 'core-product') {
      productEngine.setPerfMonitorEnabled(nextEnabled);
      return;
    }
    (selectedProductRuntime as unknown as {
      setPerfMonitorEnabled?: (nextEnabled: boolean) => void;
    }).setPerfMonitorEnabled?.(nextEnabled);
  }, [documentVisible, productRuntimeMode]);

  const setProductPerfUpdateCallback = useCallback((callback: CpuOverlayPerfCallback | null): void => {
    if (!documentVisible) {
      if (productRuntimeMode === 'core-product') {
        productEngine.setTelemetryCallback(null);
        return;
      }
      (selectedProductRuntime as unknown as {
        setPerfUpdateCallback?: (nextCallback: CpuOverlayPerfCallback | null) => void;
      }).setPerfUpdateCallback?.(null);
      return;
    }
    if (productRuntimeMode === 'core-product') {
      productEngine.setTelemetryCallback(callback ? (telemetry) => {
        callback(createProductPerfData(telemetry));
      } : null);
      return;
    }
    (selectedProductRuntime as unknown as {
      setPerfUpdateCallback?: (nextCallback: CpuOverlayPerfCallback | null) => void;
    }).setPerfUpdateCallback?.(callback);
  }, [documentVisible, productRuntimeMode]);

  useEffect(() => {
    if (!showProductRuntimeSwitcher || !documentVisible) return;

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
  }, [documentVisible, productRuntimeMode, setProductPerfMonitorEnabled, setProductPerfUpdateCallback, showProductRuntimeSwitcher]);

  return {
    productRuntimeCpuSummaries,
    setProductPerfMonitorEnabled,
    setProductPerfUpdateCallback,
  };
}
