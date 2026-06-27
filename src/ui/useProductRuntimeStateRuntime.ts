import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type {
  ProductEngineState,
  ProductFxOwnershipBus,
} from '../audio/product/ProductEngineTypes';
import { useVisibleInterval } from './hooks/useVisibleInterval';

type ProductRuntimeStateRuntimeOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  enabled: boolean;
  getProductTransportDebugState: () => ProductEngineState['transportDebug'];
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
};

const FX_OWNERSHIP_BUSES = ['delayA', 'delayB', 'granular', 'reverb'] as const satisfies readonly ProductFxOwnershipBus[];

function transportDebugMatchesCurrent(
  current: ProductEngineState['transportDebug'],
  transportDebug: ProductEngineState['transportDebug'],
): boolean {
  return Boolean(
    current &&
      transportDebug &&
      Math.abs(current.effectiveBpm - transportDebug.effectiveBpm) < 0.05 &&
      Math.abs(current.effectivePhraseSeconds - transportDebug.effectivePhraseSeconds) < 0.05 &&
      Math.abs(current.nextPhraseBoundaryIn - transportDebug.nextPhraseBoundaryIn) < 0.05 &&
      Math.abs((current.nextHarmonyEventIn ?? -1) - (transportDebug.nextHarmonyEventIn ?? -1)) < 0.05 &&
      Math.abs((current.nextProgressionStepIn ?? -1) - (transportDebug.nextProgressionStepIn ?? -1)) < 0.05 &&
      Math.abs((current.padChordPhraseSeconds ?? -1) - (transportDebug.padChordPhraseSeconds ?? -1)) < 0.05 &&
      Math.abs((current.nextPadChordBoundaryIn ?? -1) - (transportDebug.nextPadChordBoundaryIn ?? -1)) < 0.05 &&
      (current.padChordPlan?.key ?? null) === (transportDebug.padChordPlan?.key ?? null) &&
      (current.previousPadChordPlan?.key ?? null) === (transportDebug.previousPadChordPlan?.key ?? null) &&
      Math.abs((current.randomTimingPhraseSeconds ?? -1) - (transportDebug.randomTimingPhraseSeconds ?? -1)) < 0.05 &&
      Math.abs((current.nextRandomTimingBoundaryIn ?? -1) - (transportDebug.nextRandomTimingBoundaryIn ?? -1)) < 0.05 &&
      (current.randomTimingPlan?.key ?? null) === (transportDebug.randomTimingPlan?.key ?? null) &&
      (current.previousRandomTimingPlan?.key ?? null) === (transportDebug.previousRandomTimingPlan?.key ?? null),
  );
}

export function useProductRuntimeStateRuntime({
  enabled,
  getProductTransportDebugState,
  productRuntimeMode,
  setEngineState,
}: ProductRuntimeStateRuntimeOptions): void {
  useEffect(() => {
    if (productRuntimeMode !== 'core-product') {
      productEngine.setStateChangeCallback(null);
      return;
    }
    productEngine.setStateChangeCallback((nextState) => {
      setEngineState((prev) => {
        const fxOwnersChanged = FX_OWNERSHIP_BUSES.some((bus) => {
          const previous = prev.fxOwners[bus];
          const next = nextState.fxOwners[bus];
          return (
            previous.owner !== next.owner ||
            Math.abs(previous.strength - next.strength) > 0.0005 ||
            previous.lastOrigin !== next.lastOrigin ||
            previous.active !== next.active
          );
        });

        if (
          prev.isRunning === nextState.isRunning &&
          prev.harmonyState === nextState.harmonyState &&
          prev.currentSeed === nextState.currentSeed &&
          prev.currentBucket === nextState.currentBucket &&
          prev.cofCurrentStep === nextState.cofCurrentStep &&
          !fxOwnersChanged
        ) {
          return prev;
        }

        return {
          ...prev,
          isRunning: nextState.isRunning,
          harmonyState: nextState.harmonyState,
          currentSeed: nextState.currentSeed,
          currentBucket: nextState.currentBucket,
          cofCurrentStep: nextState.cofCurrentStep,
          fxOwners: fxOwnersChanged ? nextState.fxOwners : prev.fxOwners,
        };
      });
    });
    return () => {
      productEngine.setStateChangeCallback(null);
    };
  }, [productRuntimeMode, setEngineState]);

  const updateTransportDebug = useCallback(() => {
    const transportDebug = getProductTransportDebugState();
    setEngineState((prev) => {
      const current = prev.transportDebug;
      if (transportDebugMatchesCurrent(current, transportDebug)) {
        return prev;
      }
      return { ...prev, transportDebug };
    });
  }, [getProductTransportDebugState, setEngineState]);

  useVisibleInterval(updateTransportDebug, 1000, {
    enabled,
  });
}
