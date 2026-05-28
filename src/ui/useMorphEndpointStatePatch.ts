import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { isAtEndpoint0, isAtEndpoint1 } from '../audio/morphUtils';
import { collectChangedStatePatch } from './audioEngineStatePatch';
import type { SliderState } from './state';

type MorphEndpointPreset = {
  state: SliderState;
};

type MorphEndpointPresetSetter<T extends MorphEndpointPreset> = Dispatch<SetStateAction<T | null>>;

export function useMorphEndpointStatePatch<T extends MorphEndpointPreset>(
  morphPosition: number,
  setMorphPresetA: MorphEndpointPresetSetter<T>,
  setMorphPresetB: MorphEndpointPresetSetter<T>,
): (prevState: SliderState, nextState: SliderState) => void {
  return useCallback((prevState: SliderState, nextState: SliderState): void => {
    const patch = collectChangedStatePatch(prevState, nextState);
    if (Object.keys(patch).length === 0) return;

    if (isAtEndpoint0(morphPosition, true)) {
      setMorphPresetA(prev => prev ? ({
        ...prev,
        state: { ...prev.state, ...patch },
      } as T) : prev);
    } else if (isAtEndpoint1(morphPosition, true)) {
      setMorphPresetB(prev => prev ? ({
        ...prev,
        state: { ...prev.state, ...patch },
      } as T) : prev);
    }
  }, [morphPosition, setMorphPresetA, setMorphPresetB]);
}
