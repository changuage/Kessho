import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { ProductControlAction } from '../product-control';
import { removeRuntimeTriggerPositions } from '../ui/runtimeSliderState';
import {
  clearRuntimeWalkPositions,
  resetRuntimeWalkPositionsForKeys,
  seedRuntimeWalkPosition,
} from '../ui/runtimeWalkPositionSync';
import {
  type SliderMode,
  type SliderState,
  getParamInfo,
  getSliderNumericValue,
  getStateValueFromSliderNumber,
  quantize,
} from '../ui/state';
import { getDrumVoiceParamRoute } from '../ui/drums/drumVoiceParamRouting';
import { isAtEndpoint0, isAtEndpoint1 } from '../audio/morphUtils';
import {
  SINGLE_ONLY_SLIDER_KEYS,
  WALK_ONLY_DUAL_KEYS,
  normalizeDualSliderMode,
} from './AppControls';
import {
  extractNativeDualRanges,
  type DualSliderState,
} from './nativeDualRanges';

type MorphPresetDualState = {
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
};

type UseDualSliderRuntimeStateOptions<TPreset extends MorphPresetDualState> = {
  readonly state: SliderState;
  readonly stateRef: MutableRefObject<SliderState>;
  readonly setState: Dispatch<SetStateAction<SliderState>>;
  readonly isJourneyPlaying: boolean;
  readonly morphPosition: number;
  readonly morphPresetA: TPreset | null;
  readonly morphPresetB: TPreset | null;
  readonly setMorphPresetA: Dispatch<SetStateAction<TPreset | null>>;
  readonly setMorphPresetB: Dispatch<SetStateAction<TPreset | null>>;
  readonly dispatchDrumMorphProductControlAction: (
    sourceState: SliderState,
    action: ProductControlAction,
  ) => unknown;
};

export function useDualSliderRuntimeState<TPreset extends MorphPresetDualState>({
  state,
  stateRef,
  setState,
  isJourneyPlaying,
  morphPosition,
  morphPresetA,
  morphPresetB,
  setMorphPresetA,
  setMorphPresetB,
  dispatchDrumMorphProductControlAction,
}: UseDualSliderRuntimeStateOptions<TPreset>) {
  const [sliderModes, setSliderModes] = useState<Record<string, SliderMode>>({});
  const [dualSliderRanges, setDualSliderRanges] = useState<DualSliderState>({});
  const nativeDualRanges = useMemo(() => extractNativeDualRanges(dualSliderRanges), [dualSliderRanges]);

  const applyScopedDualRangesFromPreset = useCallback(
    (relevantKeys: string[], dualRanges?: Record<string, { min: number; max: number }>, presetSliderModes?: Record<string, SliderMode>) => {
      const relevantKeySet = new Set(relevantKeys);
      const nextWalkPositions: Record<string, number> = {};

      setSliderModes((prev) => {
        const next: Record<string, SliderMode> = { ...prev };
        for (const key of relevantKeySet) {
          delete next[key];
        }
        if (dualRanges) {
          for (const [key] of Object.entries(dualRanges)) {
            if (!relevantKeySet.has(key)) continue;
            next[key] = normalizeDualSliderMode(key, presetSliderModes?.[key] ?? 'walk') ?? 'walk';
          }
        }
        return next;
      });

      setDualSliderRanges((prev) => {
        const next: Record<string, { min: number; max: number } | undefined> = {
          ...prev,
        };
        for (const key of relevantKeySet) {
          delete next[key];
        }
        if (dualRanges) {
          for (const [key, range] of Object.entries(dualRanges)) {
            if (!relevantKeySet.has(key)) continue;
            next[key] = range;
            const mode = normalizeDualSliderMode(key, presetSliderModes?.[key] ?? 'walk') ?? 'walk';
            if (mode === 'walk') {
              nextWalkPositions[key] = 0.5;
            }
          }
        }
        return next as DualSliderState;
      });

      resetRuntimeWalkPositionsForKeys(relevantKeySet, nextWalkPositions);
    },
    [],
  );

  const handleCycleSliderMode = useCallback(
    (key: keyof SliderState) => {
      if (isJourneyPlaying) return;

      const keyStr = key as string;
      if (SINGLE_ONLY_SLIDER_KEYS.has(keyStr)) {
        setSliderModes((prev) => {
          if (!(keyStr in prev)) return prev;
          const next = { ...prev };
          delete next[keyStr];
          return next;
        });
        setDualSliderRanges((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        clearRuntimeWalkPositions([keyStr]);
        removeRuntimeTriggerPositions([keyStr]);
        return;
      }
      const isMorphActive = morphPresetA !== null || morphPresetB !== null;

      const drumParamRoute = getDrumVoiceParamRoute(key);
      const drumVoice = drumParamRoute?.voice ?? null;
      const drumMorphKey = drumParamRoute?.morphKey ?? null;

      const current = sliderModes[keyStr] ?? 'single';
      const nextMode: SliderMode = current === 'single' ? 'walk' : current === 'walk' ? (WALK_ONLY_DUAL_KEYS.has(keyStr) ? 'single' : 'sampleHold') : 'single';

      if (nextMode === 'single') {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) {
          const currentValue = getSliderNumericValue(key, state[key]);
          const fallbackValue = range.min + 0.5 * (range.max - range.min);
          const nextNumericValue = Math.max(range.min, Math.min(range.max, currentValue ?? fallbackValue));
          const quantizedValue = quantize(key, nextNumericValue);
          const nextValue = getStateValueFromSliderNumber(key, quantizedValue);
          setState((s) => ({ ...s, [key]: nextValue }));
        }
        setDualSliderRanges((r) => {
          const newRanges = { ...r };
          delete newRanges[key];
          return newRanges;
        });
        clearRuntimeWalkPositions([keyStr]);
        removeRuntimeTriggerPositions([keyStr]);
        setSliderModes((prev) => {
          const next = { ...prev };
          delete next[keyStr];
          return next;
        });

        if (isMorphActive) {
          if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
            setMorphPresetA((prev) => {
              if (!prev) return null;
              const newDualRanges = { ...prev.dualRanges };
              const newSliderModes = { ...prev.sliderModes };
              delete newDualRanges[keyStr];
              delete newSliderModes[keyStr];
              return {
                ...prev,
                dualRanges: Object.keys(newDualRanges).length > 0 ? newDualRanges : undefined,
                sliderModes: Object.keys(newSliderModes).length > 0 ? newSliderModes : undefined,
              } as TPreset;
            });
          } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
            setMorphPresetB((prev) => {
              if (!prev) return null;
              const newDualRanges = { ...prev.dualRanges };
              const newSliderModes = { ...prev.sliderModes };
              delete newDualRanges[keyStr];
              delete newSliderModes[keyStr];
              return {
                ...prev,
                dualRanges: Object.keys(newDualRanges).length > 0 ? newDualRanges : undefined,
                sliderModes: Object.keys(newSliderModes).length > 0 ? newSliderModes : undefined,
              } as TPreset;
            });
          }
        }

        if (drumVoice && drumMorphKey) {
          const drumMorphPosition = state[drumMorphKey] as number;
          const currentVal = state[key] as number;
          if (isAtEndpoint0(drumMorphPosition)) {
            dispatchDrumMorphProductControlAction(stateRef.current, {
              type: 'drum-morph/dual-range-set',
              voice: drumVoice,
              param: keyStr,
              isDualMode: false,
              value: currentVal,
              endpoint: 0,
            });
          } else if (isAtEndpoint1(drumMorphPosition)) {
            dispatchDrumMorphProductControlAction(stateRef.current, {
              type: 'drum-morph/dual-range-set',
              voice: drumVoice,
              param: keyStr,
              isDualMode: false,
              value: currentVal,
              endpoint: 1,
            });
          }
        }
      } else {
        setSliderModes((prev) => ({ ...prev, [keyStr]: nextMode }));

        if (current === 'single') {
          const info = getParamInfo(key);
          if (info) {
            const currentVal = getSliderNumericValue(key, state[key]) ?? info.min;
            const rangeSize = (info.max - info.min) * 0.2;
            const min = Math.max(info.min, currentVal - rangeSize / 2);
            const max = Math.min(info.max, currentVal + rangeSize / 2);
            setDualSliderRanges((r) => ({ ...r, [key]: { min, max } }));

            if (nextMode === 'walk') {
              seedRuntimeWalkPosition(keyStr);
              removeRuntimeTriggerPositions([keyStr]);
            } else {
              clearRuntimeWalkPositions([keyStr]);
              removeRuntimeTriggerPositions([keyStr]);
            }

            if (isMorphActive) {
              if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
                setMorphPresetA((prev) =>
                  prev
                    ? ({
                        ...prev,
                        dualRanges: {
                          ...prev.dualRanges,
                          [keyStr]: { min, max },
                        },
                        sliderModes: {
                          ...prev.sliderModes,
                          [keyStr]: nextMode,
                        },
                      } as TPreset)
                    : null,
                );
              } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
                setMorphPresetB((prev) =>
                  prev
                    ? ({
                        ...prev,
                        dualRanges: {
                          ...prev.dualRanges,
                          [keyStr]: { min, max },
                        },
                        sliderModes: {
                          ...prev.sliderModes,
                          [keyStr]: nextMode,
                        },
                      } as TPreset)
                    : null,
                );
              }
            }

            if (drumVoice && drumMorphKey) {
              const drumMorphPosition = state[drumMorphKey] as number;
              if (isAtEndpoint0(drumMorphPosition)) {
                dispatchDrumMorphProductControlAction(stateRef.current, {
                  type: 'drum-morph/dual-range-set',
                  voice: drumVoice,
                  param: keyStr,
                  isDualMode: true,
                  value: currentVal,
                  range: { min, max },
                  endpoint: 0,
                });
              } else if (isAtEndpoint1(drumMorphPosition)) {
                dispatchDrumMorphProductControlAction(stateRef.current, {
                  type: 'drum-morph/dual-range-set',
                  voice: drumVoice,
                  param: keyStr,
                  isDualMode: true,
                  value: currentVal,
                  range: { min, max },
                  endpoint: 1,
                });
              }
            }
          }
        } else if (current === 'walk' && nextMode === 'sampleHold') {
          clearRuntimeWalkPositions([keyStr]);
          removeRuntimeTriggerPositions([keyStr]);

          if (isMorphActive) {
            if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
              setMorphPresetA((prev) =>
                prev
                  ? ({
                      ...prev,
                      sliderModes: { ...prev.sliderModes, [keyStr]: nextMode },
                    } as TPreset)
                  : null,
              );
            } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
              setMorphPresetB((prev) =>
                prev
                  ? ({
                      ...prev,
                      sliderModes: { ...prev.sliderModes, [keyStr]: nextMode },
                    } as TPreset)
                  : null,
              );
            }
          }
        }
      }
    },
    [
      dualSliderRanges,
      dispatchDrumMorphProductControlAction,
      isJourneyPlaying,
      morphPosition,
      morphPresetA,
      morphPresetB,
      setMorphPresetA,
      setMorphPresetB,
      setState,
      sliderModes,
      state,
      stateRef,
    ],
  );

  const handleDualRangeChange = useCallback(
    (key: keyof SliderState, min: number, max: number) => {
      if (isJourneyPlaying) return;

      const keyStr = key as string;
      if (SINGLE_ONLY_SLIDER_KEYS.has(keyStr)) return;

      setDualSliderRanges((prev) => ({ ...prev, [key]: { min, max } }));

      const isMorphActive = morphPresetA !== null || morphPresetB !== null;
      if (isMorphActive) {
        if (isAtEndpoint0(morphPosition, true) && morphPresetA) {
          setMorphPresetA((prev) =>
            prev
              ? ({
                  ...prev,
                  dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } },
                } as TPreset)
              : null,
          );
        } else if (isAtEndpoint1(morphPosition, true) && morphPresetB) {
          setMorphPresetB((prev) =>
            prev
              ? ({
                  ...prev,
                  dualRanges: { ...prev.dualRanges, [keyStr]: { min, max } },
                } as TPreset)
              : null,
          );
        }
      }

      const drumParamRoute = getDrumVoiceParamRoute(key);
      const drumVoice = drumParamRoute?.voice ?? null;
      const drumMorphKey = drumParamRoute?.morphKey ?? null;

      if (drumVoice && drumMorphKey) {
        const drumMorphPosition = state[drumMorphKey] as number;
        const currentVal = state[key] as number;
        if (isAtEndpoint0(drumMorphPosition)) {
          dispatchDrumMorphProductControlAction(stateRef.current, {
            type: 'drum-morph/dual-range-set',
            voice: drumVoice,
            param: keyStr,
            isDualMode: true,
            value: currentVal,
            range: { min, max },
            endpoint: 0,
          });
        } else if (isAtEndpoint1(drumMorphPosition)) {
          dispatchDrumMorphProductControlAction(stateRef.current, {
            type: 'drum-morph/dual-range-set',
            voice: drumVoice,
            param: keyStr,
            isDualMode: true,
            value: currentVal,
            range: { min, max },
            endpoint: 1,
          });
        }
      }
    },
    [
      dispatchDrumMorphProductControlAction,
      isJourneyPlaying,
      morphPosition,
      morphPresetA,
      morphPresetB,
      setMorphPresetA,
      setMorphPresetB,
      state,
      stateRef,
    ],
  );

  return {
    sliderModes,
    setSliderModes,
    dualSliderRanges,
    setDualSliderRanges,
    nativeDualRanges,
    applyScopedDualRangesFromPreset,
    handleCycleSliderMode,
    handleDualRangeChange,
  };
}
