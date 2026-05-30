import { useEffect, useState } from 'react';
import type { CoreProductModulationDebugEntry } from '../audio/coreProductTelemetry';
import type { ProductEnginePort } from '../audio/product/ProductEnginePort';

export type ProductCoreDebugSummary = {
  earth: string;
  randomWalk: string;
  sampleHold: string;
};

function summarizeProductCoreModulation(entries: CoreProductModulationDebugEntry[], kind: 'walk' | 'sampleHold'): string {
  if (entries.length === 0) return kind === 'walk' ? 'runtime walk inactive' : 'sample-hold inactive';
  const rendered = entries.slice(0, 3).map((entry) => {
    const name = entry.controlName ?? `#${entry.controlId}`;
    const position = `${Math.round(entry.normalizedPosition * 100)}%`;
    if (kind === 'walk') {
      const scope = entry.randomWalkGlobal ? 'global' : 'local';
      return `${name} ${position} ${scope}`;
    }
    return `${name} ${position} bus ${entry.triggerBus} #${entry.triggerCounter}`;
  });
  const extra = entries.length > rendered.length ? ` +${entries.length - rendered.length}` : '';
  return `${rendered.join(', ')}${extra}`;
}

export function useProductCoreDebugSummary(
  productRuntimeMode: string,
  runtime: Pick<ProductEnginePort, 'getTelemetry'>,
): ProductCoreDebugSummary | null {
  const [summary, setSummary] = useState<ProductCoreDebugSummary | null>(null);

  useEffect(() => {
    if (productRuntimeMode !== 'core-product') {
      setSummary(null);
      return;
    }
    const readDebugSummary = () => {
      const telemetry = runtime.getTelemetry();
      const earth = telemetry?.earthTextureDebugState;
      const earthSummary = earth
        ? (['waves', 'birds', 'birds2', 'frogs'] as const)
          .map((key) => {
            const slot = earth[key];
            return `${key}:${slot?.active ? 'active' : slot?.inactiveReason ?? 'idle'}`;
          })
          .join(' ')
        : '-';
      setSummary({
        earth: earthSummary,
        randomWalk: summarizeProductCoreModulation(telemetry?.productModulationDebug?.randomWalk ?? [], 'walk'),
        sampleHold: summarizeProductCoreModulation(telemetry?.productModulationDebug?.sampleHold ?? [], 'sampleHold'),
      });
    };
    readDebugSummary();
    const interval = window.setInterval(readDebugSummary, 500);
    return () => window.clearInterval(interval);
  }, [productRuntimeMode, runtime]);

  return summary;
}
