import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import { useVisibleInterval } from './hooks/useVisibleInterval';

type UseSelectedAudioEngineTransportDebugOptions = {
  enabled: boolean;
  getSelectedTransportDebugState: () => ProductEngineState['transportDebug'];
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
};

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

export function useSelectedAudioEngineTransportDebug({
  enabled,
  getSelectedTransportDebugState,
  setEngineState,
}: UseSelectedAudioEngineTransportDebugOptions): void {
  const updateTransportDebug = useCallback(() => {
    const transportDebug = getSelectedTransportDebugState();
    setEngineState(prev => {
      const current = prev.transportDebug;
      if (transportDebugMatchesCurrent(current, transportDebug)) {
        return prev;
      }
      return { ...prev, transportDebug };
    });
  }, [getSelectedTransportDebugState, setEngineState]);

  useVisibleInterval(updateTransportDebug, 100, {
    enabled,
  });
}
