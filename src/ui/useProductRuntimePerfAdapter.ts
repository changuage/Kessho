import { useCallback, useEffect, useState } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { CpuOverlayPerfCallback } from './CpuOverlay';
import {
  createProductPerfData,
  readAudioEngineCpuSummaries,
  summarizeAudioEngineCpu,
  writeAudioEngineCpuSummaries,
  type AudioEngineCpuSummaries,
} from './audioEngineRuntimeUi';

type ProductRuntimePerfAdapter = {
  audioEngineCpuSummaries: AudioEngineCpuSummaries;
  setProductPerfMonitorEnabled: (enabled: boolean) => void;
  setProductPerfUpdateCallback: (callback: CpuOverlayPerfCallback | null) => void;
};

export function useProductRuntimePerfAdapter(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
  showAudioEngineSwitcher: boolean,
): ProductRuntimePerfAdapter {
  const [audioEngineCpuSummaries, setAudioEngineCpuSummaries] = useState<AudioEngineCpuSummaries>(
    () => readAudioEngineCpuSummaries(),
  );

  const setProductPerfMonitorEnabled = useCallback((enabled: boolean): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setPerfMonitorEnabled(enabled);
      return;
    }
    (selectedProductRuntime as unknown as {
      setPerfMonitorEnabled?: (nextEnabled: boolean) => void;
    }).setPerfMonitorEnabled?.(enabled);
  }, [audioEngineRuntimeMode]);

  const setProductPerfUpdateCallback = useCallback((callback: CpuOverlayPerfCallback | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setTelemetryCallback(callback ? (telemetry) => {
        callback(createProductPerfData(telemetry));
      } : null);
      return;
    }
    (selectedProductRuntime as unknown as {
      setPerfUpdateCallback?: (nextCallback: CpuOverlayPerfCallback | null) => void;
    }).setPerfUpdateCallback?.(callback);
  }, [audioEngineRuntimeMode]);

  useEffect(() => {
    if (!showAudioEngineSwitcher) return;

    setProductPerfMonitorEnabled(true);
    setProductPerfUpdateCallback((data) => {
      const summary = summarizeAudioEngineCpu(data);
      if (!summary) return;
      setAudioEngineCpuSummaries((prev) => {
        const next = { ...prev, [audioEngineRuntimeMode]: summary };
        writeAudioEngineCpuSummaries(next);
        return next;
      });
    });

    return () => {
      setProductPerfUpdateCallback(null);
      setProductPerfMonitorEnabled(false);
    };
  }, [audioEngineRuntimeMode, setProductPerfMonitorEnabled, setProductPerfUpdateCallback, showAudioEngineSwitcher]);

  return {
    audioEngineCpuSummaries,
    setProductPerfMonitorEnabled,
    setProductPerfUpdateCallback,
  };
}
