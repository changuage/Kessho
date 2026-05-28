import { useCallback } from 'react';

type JourneyMorphClockCallback = (now: number) => void;

type UseSelectedAudioEngineMorphRuntimeOptions = {
  resetSelectedCofDrift: () => void;
  setSelectedJourneyMorphClockCallback: (callback: JourneyMorphClockCallback | null) => void;
  startSelectedJourneyMorphClock: () => void;
  stopSelectedJourneyMorphClock: () => void;
};

type SelectedAudioEngineMorphRuntime = {
  resetCofDrift: () => void;
  startJourneyMorphClock: (callback: JourneyMorphClockCallback) => void;
  stopJourneyMorphClock: () => void;
};

export function useSelectedAudioEngineMorphRuntime({
  resetSelectedCofDrift,
  setSelectedJourneyMorphClockCallback,
  startSelectedJourneyMorphClock,
  stopSelectedJourneyMorphClock,
}: UseSelectedAudioEngineMorphRuntimeOptions): SelectedAudioEngineMorphRuntime {
  const resetCofDrift = useCallback((): void => {
    resetSelectedCofDrift();
  }, [resetSelectedCofDrift]);

  const startJourneyMorphClock = useCallback((callback: JourneyMorphClockCallback): void => {
    setSelectedJourneyMorphClockCallback(callback);
    startSelectedJourneyMorphClock();
  }, [setSelectedJourneyMorphClockCallback, startSelectedJourneyMorphClock]);

  const stopJourneyMorphClock = useCallback((): void => {
    stopSelectedJourneyMorphClock();
    setSelectedJourneyMorphClockCallback(null);
  }, [setSelectedJourneyMorphClockCallback, stopSelectedJourneyMorphClock]);

  return {
    resetCofDrift,
    startJourneyMorphClock,
    stopJourneyMorphClock,
  };
}
