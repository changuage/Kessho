import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { isAtEndpoint0, isAtEndpoint1 } from '../audio/morphUtils';
import { collectChangedStatePatch } from './audioEngineStatePatch';
import type { SliderState } from './state';

export type MorphEndpointPreset = {
  state: SliderState;
};

type MorphEndpointPresetSetter<T extends MorphEndpointPreset> = Dispatch<SetStateAction<T | null>>;

export function mergeMorphEndpointStatePatch<T extends MorphEndpointPreset>(
  endpoint: T | null,
  prevState: SliderState,
  nextState: SliderState,
): T | null {
  if (!endpoint) return endpoint;
  const patch = collectChangedStatePatch(prevState, nextState);
  if (Object.keys(patch).length === 0) return endpoint;
  return {
    ...endpoint,
    state: { ...endpoint.state, ...patch },
  } as T;
}

export function useMorphEndpointStatePatch<T extends MorphEndpointPreset>(
  morphPosition: number,
  setMorphPresetA: MorphEndpointPresetSetter<T>,
  setMorphPresetB: MorphEndpointPresetSetter<T>,
): (prevState: SliderState, nextState: SliderState) => void {
  return useCallback((prevState: SliderState, nextState: SliderState): void => {
    if (isAtEndpoint0(morphPosition, true)) {
      setMorphPresetA(prev => mergeMorphEndpointStatePatch(prev, prevState, nextState));
    } else if (isAtEndpoint1(morphPosition, true)) {
      setMorphPresetB(prev => mergeMorphEndpointStatePatch(prev, prevState, nextState));
    }
  }, [morphPosition, setMorphPresetA, setMorphPresetB]);
}
