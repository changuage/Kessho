import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { ProductControlAction } from '../product-control';
import {
  getRuntimeSliderPosition,
  removeRuntimeTriggerPositions,
} from '../ui/runtimeSliderState';
import { getRuntimeValue } from '../ui/runtimeValueState';
import { resolveEffectiveSliderValue } from '../ui/sliderSystem/effectiveValue';
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
  normalizeDualSliderMode,
} from './AppControls';
import { getSliderCapability } from '../ui/sliderSystem/sliderCapabilities';
import {
  extractNativeDualRanges,
  type DualSliderState,
} from './nativeDualRanges';
import {
  dualConfigReducer,
  fromLegacyDualState,
  toLegacyDualState,
  type DualSliderConfigAction,
  type DualSliderConfigMap,
} from '../ui/sliderSystem/dualConfigReducer';

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
  const [dualConfigs, dispatchDualConfigs] = useReducer(
    dualConfigReducer<string>,
    {} as DualSliderConfigMap<string>,
  );
  const dualConfigsRef = useRef<DualSliderConfigMap<string>>(dualConfigs);
  const legacyModesRef = useRef<Record<string, SliderMode>>({});
  const legacyRangesRef = useRef<DualSliderState>({});
  const legacyReconcileScheduledRef = useRef(false);

  const syncLegacyRefs = useCallback((configs: DualSliderConfigMap<string>) => {
    const legacy = toLegacyDualState(configs);
    legacyModesRef.current = legacy.sliderModes as Record<string, SliderMode>;
    legacyRangesRef.current = legacy.dualRanges as DualSliderState;
  }, []);

  const commitDualConfigAction = useCallback((action: DualSliderConfigAction<string>) => {
    const next = dualConfigReducer(dualConfigsRef.current, action);
    if (next === dualConfigsRef.current) return;
    dualConfigsRef.current = next;
    syncLegacyRefs(next);
    dispatchDualConfigs({ type: 'replaceScope', configs: next });
  }, [syncLegacyRefs]);

  const scheduleLegacyReconcile = useCallback(() => {
    if (legacyReconcileScheduledRef.current) return;
    legacyReconcileScheduledRef.current = true;
    queueMicrotask(() => {
      legacyReconcileScheduledRef.current = false;
      const next = fromLegacyDualState(legacyModesRef.current, legacyRangesRef.current);
      dualConfigsRef.current = next;
      syncLegacyRefs(next);
      dispatchDualConfigs({ type: 'replaceScope', configs: next });
    });
  }, [syncLegacyRefs]);

  const setSliderModes: Dispatch<SetStateAction<Record<string, SliderMode>>> = useCallback((update) => {
    legacyModesRef.current = typeof update === 'function'
      ? update(legacyModesRef.current)
      : update;
    scheduleLegacyReconcile();
  }, [scheduleLegacyReconcile]);

  const setDualSliderRanges: Dispatch<SetStateAction<DualSliderState>> = useCallback((update) => {
    legacyRangesRef.current = typeof update === 'function'
      ? update(legacyRangesRef.current)
      : update;
    scheduleLegacyReconcile();
  }, [scheduleLegacyReconcile]);

  const legacyDualState = useMemo(() => toLegacyDualState(dualConfigs), [dualConfigs]);
  const sliderModes = legacyDualState.sliderModes as Record<string, SliderMode>;
  const dualSliderRanges = legacyDualState.dualRanges as DualSliderState;
  const nativeDualRanges = useMemo(() => extractNativeDualRanges(dualSliderRanges), [dualSliderRanges]);

  const applyScopedDualRangesFromPreset = useCallback(
    (relevantKeys: string[], dualRanges?: Record<string, { min: number; max: number }>, presetSliderModes?: Record<string, SliderMode>) => {
      const relevantKeySet = new Set(relevantKeys);
      const nextWalkPositions: Record<string, number> = {};

      const nextConfigs: DualSliderConfigMap<string> = { ...dualConfigsRef.current };
      for (const key of relevantKeySet) delete nextConfigs[key];
      if (dualRanges) {
        for (const [key, range] of Object.entries(dualRanges)) {
          if (!relevantKeySet.has(key)) continue;
          const mode = normalizeDualSliderMode(key, presetSliderModes?.[key] ?? 'walk') ?? 'walk';
          if (mode === 'single') continue;
          nextConfigs[key] = { mode, range: [range.min, range.max] };
          if (mode === 'walk') nextWalkPositions[key] = 0.5;
        }
      }
      commitDualConfigAction({ type: 'replaceScope', configs: nextConfigs });

      resetRuntimeWalkPositionsForKeys(relevantKeySet, nextWalkPositions);
    },
    [commitDualConfigAction],
  );

  const handleCycleSliderMode = useCallback(
    (key: keyof SliderState) => {
      if (isJourneyPlaying) return;

      const keyStr = key as string;
      const capability = getSliderCapability(keyStr);
      if (!capability || capability === 'single') {
        commitDualConfigAction({ type: 'remove', key: keyStr });
        clearRuntimeWalkPositions([keyStr]);
        removeRuntimeTriggerPositions([keyStr]);
        return;
      }
      const isMorphActive = morphPresetA !== null || morphPresetB !== null;

      const drumParamRoute = getDrumVoiceParamRoute(key);
      const drumVoice = drumParamRoute?.voice ?? null;
      const drumMorphKey = drumParamRoute?.morphKey ?? null;

      const currentConfig = dualConfigsRef.current[keyStr];
      const current = currentConfig?.mode ?? 'single';
      const nextMode: SliderMode = current === 'single'
        ? 'walk'
        : current === 'walk'
          ? (capability === 'walk-only' ? 'single' : 'sampleHold')
          : 'single';

      if (nextMode === 'single') {
        const range = currentConfig
          ? { min: currentConfig.range[0], max: currentConfig.range[1] }
          : undefined;
        if (range) {
          const currentValue = getSliderNumericValue(key, state[key]);
          const fallbackValue = range.min + 0.5 * (range.max - range.min);
          const authoredValue = currentValue ?? fallbackValue;
          const nextNumericValue = resolveEffectiveSliderValue({
            authoredValue,
            mode: current,
            range: [range.min, range.max],
            runtimePosition: getRuntimeSliderPosition(keyStr, current),
            runtimeValue: getRuntimeValue(keyStr),
            domain: getParamInfo(key) ?? undefined,
          });
          const quantizedValue = quantize(key, nextNumericValue);
          const nextValue = getStateValueFromSliderNumber(key, quantizedValue);
          setState((s) => ({ ...s, [key]: nextValue }));
        }
        commitDualConfigAction({ type: 'remove', key: keyStr });
        clearRuntimeWalkPositions([keyStr]);
        removeRuntimeTriggerPositions([keyStr]);

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
        if (current === 'single') {
          const info = getParamInfo(key);
          if (info) {
            const currentVal = getSliderNumericValue(key, state[key]) ?? info.min;
            const rangeSize = (info.max - info.min) * 0.2;
            const min = Math.max(info.min, currentVal - rangeSize / 2);
            const max = Math.min(info.max, currentVal + rangeSize / 2);
            commitDualConfigAction({
              type: 'enable',
              key: keyStr,
              mode: nextMode,
              range: [min, max],
            });

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
          commitDualConfigAction({ type: 'setMode', key: keyStr, mode: 'sampleHold' });
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
      commitDualConfigAction,
      dispatchDrumMorphProductControlAction,
      isJourneyPlaying,
      morphPosition,
      morphPresetA,
      morphPresetB,
      setMorphPresetA,
      setMorphPresetB,
      setState,
      state,
      stateRef,
    ],
  );

  const handleDualRangeChange = useCallback(
    (key: keyof SliderState, min: number, max: number) => {
      if (isJourneyPlaying) return;

      const keyStr = key as string;
      const capability = getSliderCapability(keyStr);
      if (!capability || capability === 'single') return;

      commitDualConfigAction({ type: 'setRange', key: keyStr, range: [min, max] });

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
      commitDualConfigAction,
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
