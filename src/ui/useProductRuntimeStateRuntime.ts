import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type {
  ProductEngineState,
  ProductFxOwnershipBus,
} from '../audio/product/ProductEngineTypes';
import type { ProductRuntimeStateProjection, ProductRuntimeStateSurface } from './productRuntimeConstruction';
import { useVisibleInterval } from './hooks/useVisibleInterval';

type ProductRuntimeStateRuntimeOptions = {
  productRuntimeState: ProductRuntimeStateSurface;
  enabled: boolean;
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
};

const FX_OWNERSHIP_BUSES = ['delayA', 'delayB', 'granular', 'reverb'] as const satisfies readonly ProductFxOwnershipBus[];

type RuntimeStateProjection = ProductRuntimeStateProjection & Partial<Pick<ProductEngineState, 'fxOwners'>>;

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
      current.simpleSequencerPlansAuthoritative === transportDebug.simpleSequencerPlansAuthoritative &&
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

function applyRuntimeStateProjection(
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>,
  nextState: RuntimeStateProjection,
): void {
  setEngineState((prev) => {
    const fxOwnersChanged = nextState.fxOwners
      ? FX_OWNERSHIP_BUSES.some((bus) => {
        const previous = prev.fxOwners[bus];
        const next = nextState.fxOwners?.[bus];
        return Boolean(
          next && (
            previous.owner !== next.owner ||
            Math.abs(previous.strength - next.strength) > 0.0005 ||
            previous.lastOrigin !== next.lastOrigin ||
            previous.active !== next.active
          ),
        );
      })
      : false;

    if (
      prev.isRunning === nextState.isRunning &&
      prev.harmonyState === nextState.harmonyState &&
      prev.currentSeed === nextState.currentSeed &&
      prev.currentBucket === nextState.currentBucket &&
      prev.cofCurrentStep === nextState.cofCurrentStep &&
      prev.harmonyPosition?.absoluteBarIndex === nextState.harmonyPosition?.absoluteBarIndex &&
      prev.harmonyPosition?.phraseIndex === nextState.harmonyPosition?.phraseIndex &&
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
      harmonyPosition: nextState.harmonyPosition,
      fxOwners: fxOwnersChanged && nextState.fxOwners ? nextState.fxOwners : prev.fxOwners,
    };
  });
}

export function useProductRuntimeStateRuntime({
  enabled,
  productRuntimeState,
  setEngineState,
}: ProductRuntimeStateRuntimeOptions): void {
  const applyRuntimeState = useCallback((nextState: ProductRuntimeStateProjection): void => {
    applyRuntimeStateProjection(setEngineState, nextState);
  }, [setEngineState]);

  useEffect(() => productRuntimeState.subscribe(applyRuntimeState), [applyRuntimeState, productRuntimeState]);

  const refreshRuntimeState = useCallback((): void => {
    if (!productRuntimeState.refresh) return;
    void productRuntimeState.refresh()
      .then(applyRuntimeState)
      .catch(() => {
        // A development reference runtime can be torn down while a refresh is
        // in flight; the subscription remains the authoritative update path.
      });
  }, [applyRuntimeState, productRuntimeState]);

  useEffect(() => {
    refreshRuntimeState();
  }, [refreshRuntimeState]);

  useVisibleInterval(
    refreshRuntimeState,
    productRuntimeState.refreshIntervalMs ?? 1000,
    { enabled: productRuntimeState.refreshIntervalMs !== undefined },
  );

  const updateTransportDebug = useCallback(() => {
    const transportDebug = productRuntimeState.getTransportDebugState();
    setEngineState((prev) => {
      const current = prev.transportDebug;
      if (transportDebugMatchesCurrent(current, transportDebug)) {
        return prev;
      }
      return { ...prev, transportDebug };
    });
  }, [productRuntimeState, setEngineState]);

  useVisibleInterval(updateTransportDebug, 1000, {
    enabled,
  });
}
