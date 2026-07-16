import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type {
  ProductEngineState,
  ProductFxOwnershipBus,
} from '../audio/product/ProductEngineTypes';

type SelectedAudioEngineStateReconciliationOptions = {
  enabled?: boolean;
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
  setSelectedEngineStateChangeCallback: (callback: ((state: ProductEngineState) => void) | null) => void;
};

const FX_OWNERSHIP_BUSES = ['delayA', 'delayB', 'granular', 'reverb'] as const satisfies readonly ProductFxOwnershipBus[];

export function useSelectedAudioEngineStateReconciliation({
  enabled = true,
  setEngineState,
  setSelectedEngineStateChangeCallback,
}: SelectedAudioEngineStateReconciliationOptions): void {
  useEffect(() => {
    if (!enabled) return;
    setSelectedEngineStateChangeCallback((nextState) => {
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
      setSelectedEngineStateChangeCallback(null);
    };
  }, [enabled, setEngineState, setSelectedEngineStateChangeCallback]);
}
