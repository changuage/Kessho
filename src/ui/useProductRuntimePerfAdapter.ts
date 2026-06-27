import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { CpuOverlayPerfCallback } from './CpuOverlay';
import {
  filterProductRuntimePerfMetrics,
  readProductRuntimeCpuSummaries,
  summarizeProductRuntimeCpu,
  writeProductRuntimeCpuSummaries,
  type ProductRuntimeCpuSummary,
  type ProductRuntimeCpuSummaries,
} from './productRuntimeUi';
import { useDocumentVisibility } from './hooks/useDocumentVisibility';
import { PRODUCT_DEBUG_PANEL_INTERVAL_MS } from './productRuntimeTelemetryRateLimits';

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
  const pendingCpuSummaryRef = useRef<ProductRuntimeCpuSummary | null>(null);
  const publishTimerRef = useRef<number | null>(null);
  const lastCpuSummaryPublishAtRef = useRef(0);

  const clearPendingCpuSummary = useCallback(() => {
    pendingCpuSummaryRef.current = null;
    if (publishTimerRef.current !== null) {
      window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
    }
  }, []);

  const publishPendingCpuSummary = useCallback(() => {
    if (publishTimerRef.current !== null) {
      window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = null;
    }
    const summary = pendingCpuSummaryRef.current;
    pendingCpuSummaryRef.current = null;
    if (!summary) return;
    lastCpuSummaryPublishAtRef.current = Date.now();
    setProductRuntimeCpuSummaries((prev) => {
      const current = prev[productRuntimeMode];
      if (
        current &&
        current.avgPercent === summary.avgPercent &&
        current.peakPercent === summary.peakPercent &&
        current.missPercent === summary.missPercent &&
        current.moduleCount === summary.moduleCount
      ) {
        return prev;
      }
      const next = { ...prev, [productRuntimeMode]: summary };
      writeProductRuntimeCpuSummaries(next);
      return next;
    });
  }, [productRuntimeMode]);

  const scheduleCpuSummaryPublish = useCallback((summary: ProductRuntimeCpuSummary) => {
    pendingCpuSummaryRef.current = summary;
    const elapsedMs = Date.now() - lastCpuSummaryPublishAtRef.current;
    if (elapsedMs >= PRODUCT_DEBUG_PANEL_INTERVAL_MS) {
      publishPendingCpuSummary();
      return;
    }
    if (publishTimerRef.current !== null) return;
    publishTimerRef.current = window.setTimeout(
      publishPendingCpuSummary,
      Math.max(1, PRODUCT_DEBUG_PANEL_INTERVAL_MS - elapsedMs),
    );
  }, [publishPendingCpuSummary]);

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
        productEngine.setPerfUpdateCallback(null);
        return;
      }
      (selectedProductRuntime as unknown as {
        setPerfUpdateCallback?: (nextCallback: CpuOverlayPerfCallback | null) => void;
      }).setPerfUpdateCallback?.(null);
      return;
    }
    if (productRuntimeMode === 'core-product') {
      productEngine.setPerfUpdateCallback(callback ? (data) => {
        callback(filterProductRuntimePerfMetrics(data));
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
      scheduleCpuSummaryPublish(summary);
    });

    return () => {
      clearPendingCpuSummary();
      setProductPerfUpdateCallback(null);
      setProductPerfMonitorEnabled(false);
    };
  }, [
    clearPendingCpuSummary,
    documentVisible,
    productRuntimeMode,
    scheduleCpuSummaryPublish,
    setProductPerfMonitorEnabled,
    setProductPerfUpdateCallback,
    showProductRuntimeSwitcher,
  ]);

  return {
    productRuntimeCpuSummaries,
    setProductPerfMonitorEnabled,
    setProductPerfUpdateCallback,
  };
}
