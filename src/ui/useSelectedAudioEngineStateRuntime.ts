import type { Dispatch, SetStateAction } from 'react';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import { useSelectedAudioEngineStateReconciliation } from './useSelectedAudioEngineStateReconciliation';
import { useSelectedAudioEngineStateReconciliationSurface } from './useSelectedAudioEngineStateReconciliationSurface';
import { useSelectedAudioEngineTransportDebug } from './useSelectedAudioEngineTransportDebug';

type UseSelectedAudioEngineStateRuntimeOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  enabled: boolean;
  getSelectedTransportDebugState: () => ProductEngineState['transportDebug'];
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
};

export function useSelectedAudioEngineStateRuntime({
  audioEngineRuntimeMode,
  enabled,
  getSelectedTransportDebugState,
  setEngineState,
}: UseSelectedAudioEngineStateRuntimeOptions): void {
  const {
    setSelectedEngineStateChangeCallback,
  } = useSelectedAudioEngineStateReconciliationSurface(audioEngineRuntimeMode);

  useSelectedAudioEngineStateReconciliation({
    setEngineState,
    setSelectedEngineStateChangeCallback,
  });

  useSelectedAudioEngineTransportDebug({
    enabled,
    getSelectedTransportDebugState,
    setEngineState,
  });
}
