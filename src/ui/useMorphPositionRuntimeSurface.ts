import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { calculateDriftedRoot } from '../audio/harmony';
import { clampMorphPosition, isAtEndpoint0, isAtEndpoint1, isInMidMorph } from '../audio/morphUtils';
import type { DualSliderRange } from './DualSlider';
import type { DualSliderConfig } from './sliderSystem/dualConfigReducer';
import type { ProductRuntimeParamUpdateOptions } from './useProductRuntimePresetSurface';
import { USER_PREFERENCE_KEYS } from './presetUtils';
import { DEFAULT_STATE, type SliderMode, type SliderState } from './state';
import type {
  ProductAutoCycleEndpointPair,
  ProductAutoCycleProjection,
  ProductAutoCycleRuntimeSurface,
} from './useProductRuntimeAutoCycleSurface';
import {
  createMorphPositionScheduler,
  type MorphPositionCommitOptions,
  type MorphPositionScheduler,
} from './morphPositionRaf';

type MorphCoFViz = {
  isMorphing: boolean;
  startRoot: number;
  effectiveRoot: number;
  targetRoot: number;
  cofStep: number;
  totalSteps: number;
} | null;

type MorphRuntimePreset = {
  name: string;
  timestamp: string;
  state: SliderState;
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
  dualSliderConfigs?: Partial<Record<string, DualSliderConfig>>;
};

type ProductAutoModulationEndpointPair = {
  endpointA: MorphRuntimePreset;
  endpointB: MorphRuntimePreset;
};

type MorphRuntimeResult = {
  state: SliderState;
  endpointStateA: SliderState;
  endpointStateB: SliderState;
  dualRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
  dualModes: Record<string, SliderMode>;
  dualConfigs: Record<string, DualSliderConfig>;
  morphCoFInfo?: NonNullable<MorphCoFViz> | null;
};

type MorphManualOverrides = Record<string, { value: number; morphPosition: number }>;
type MorphCountdown = { phase: string; phrasesLeft: number } | null;
type MorphMode = 'manual' | 'auto';
type MorphPhase = 'hold' | 'entry' | 'playA' | 'morphAB' | 'playB' | 'morphBA';
type MorphEndpointContentRefs = Pick<MorphRuntimePreset, 'state' | 'dualRanges' | 'sliderModes' | 'dualSliderConfigs'>;
type MorphResolvedInputs = {
  endpointA: MorphEndpointContentRefs;
  endpointB: MorphEndpointContentRefs;
  overrides: MorphManualOverrides;
  liveStateValues: unknown[];
  currentCofStep: number;
  capturedStartRoot: number | null;
  direction: 'toA' | 'toB';
};
type LastResolvedMorph = {
  position: number;
  inputs: MorphResolvedInputs;
  state: SliderState;
  result: MorphRuntimeResult;
};

function endpointContentRefs(preset: MorphRuntimePreset): MorphEndpointContentRefs {
  return {
    state: preset.state,
    dualRanges: preset.dualRanges,
    sliderModes: preset.sliderModes,
    dualSliderConfigs: preset.dualSliderConfigs,
  };
}

function sameEndpointContentRefs(left: MorphEndpointContentRefs, right: MorphEndpointContentRefs): boolean {
  return left.state === right.state
    && left.dualRanges === right.dualRanges
    && left.sliderModes === right.sliderModes
    && left.dualSliderConfigs === right.dualSliderConfigs;
}

function sameMorphOverrides(left: MorphManualOverrides, right: MorphManualOverrides): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const leftOverride = left[key];
    const rightOverride = right[key];
    return rightOverride !== undefined
      && Object.is(leftOverride?.value, rightOverride.value)
      && Object.is(leftOverride?.morphPosition, rightOverride.morphPosition);
  });
}

function cloneMorphOverrides(overrides: MorphManualOverrides): MorphManualOverrides {
  return Object.fromEntries(
    Object.entries(overrides).map(([key, override]) => [key, { ...override }]),
  );
}

function sameMorphResolvedInputs(left: MorphResolvedInputs, right: MorphResolvedInputs): boolean {
  return sameEndpointContentRefs(left.endpointA, right.endpointA)
    && sameEndpointContentRefs(left.endpointB, right.endpointB)
    && sameMorphOverrides(left.overrides, right.overrides)
    && left.liveStateValues.length === right.liveStateValues.length
    && left.liveStateValues.every((value, index) => Object.is(value, right.liveStateValues[index]))
    && Object.is(left.currentCofStep, right.currentCofStep)
    && Object.is(left.capturedStartRoot, right.capturedStartRoot)
    && left.direction === right.direction;
}

function captureMorphLiveStateValues(state: SliderState, stateRef: SliderState): unknown[] {
  return [
    ...USER_PREFERENCE_KEYS.map((key) => state[key]),
    stateRef.synthChordGeneratorEnabled,
    stateRef.synthChordGeneratorSource,
    stateRef.leadRandomEnabled,
    stateRef.leadRandomSource,
  ];
}

type UseMorphPositionRuntimeSurfaceOptions<TPreset extends MorphRuntimePreset> = {
  morphPresetA: TPreset | null;
  morphPresetB: TPreset | null;
  morphMode: MorphMode;
  morphPosition: number;
  currentCofStep: number;
  state: SliderState;
  stateRef: MutableRefObject<SliderState>;
  morphPlayPhrases: number;
  morphTransitionPhrases: number;
  morphPlayPhrasesRef: MutableRefObject<number>;
  morphTransitionPhrasesRef: MutableRefObject<number>;
  morphCapturedStateRef: MutableRefObject<SliderState | null>;
  morphCapturedDualRangesRef: MutableRefObject<Record<string, { min: number; max: number }> | null>;
  morphCapturedSliderModesRef: MutableRefObject<Record<string, SliderMode> | null>;
  morphCapturedDualConfigsRef: MutableRefObject<Record<string, DualSliderConfig> | null>;
  morphCapturedStartRootRef: MutableRefObject<number | null>;
  morphDirectionRef: MutableRefObject<'toB' | 'toA' | null>;
  lastMorphEndpointRef: MutableRefObject<number>;
  morphManualOverridesRef: MutableRefObject<MorphManualOverrides>;
  setMorphPosition: Dispatch<SetStateAction<number>>;
  setState: Dispatch<SetStateAction<SliderState>>;
  dualConfigs: Record<string, DualSliderConfig | undefined>;
  setDualSliderConfigs: (configs: Record<string, DualSliderConfig>) => void;
  setMorphCoFViz: Dispatch<SetStateAction<MorphCoFViz>>;
  setMorphCountdown: Dispatch<SetStateAction<MorphCountdown>>;
  lerpPresets: (
    presetA: TPreset,
    presetB: TPreset,
    t: number,
    currentCofStep?: number,
    capturedStartRoot?: number,
    direction?: 'toA' | 'toB',
  ) => MorphRuntimeResult;
  resetCofDrift: () => void;
  resetRuntimeWalkPositionsForModes: (modes: Record<string, SliderMode>) => void;
  scheduleProductRuntimeParamUpdate: (nextState: SliderState, options?: ProductRuntimeParamUpdateOptions) => void;
  isEngineRunning: boolean;
  productRuntimeActive: boolean;
  productAutoCycleRuntime: ProductAutoCycleRuntimeSurface;
};

type MorphPositionRuntimeSurface = {
  handleMorphPositionChange: (newPosition: number, options?: { flush?: boolean }) => void;
  invalidateMorphInputs: () => void;
};

export function preserveRunningSimpleSequencers(next: SliderState, current: SliderState): SliderState {
  let preserved = next;
  if (current.synthChordGeneratorEnabled) {
    preserved = {
      ...preserved,
      synthChordGeneratorEnabled: true,
      synthChordGeneratorSource: current.synthChordGeneratorSource,
    };
  }
  if (current.leadRandomEnabled) {
    preserved = {
      ...preserved,
      leadRandomEnabled: true,
      leadRandomSource: current.leadRandomSource,
    };
  }
  return preserved;
}

export function useMorphPositionRuntimeSurface<TPreset extends MorphRuntimePreset>({
  morphPresetA,
  morphPresetB,
  morphMode,
  morphPosition,
  currentCofStep,
  state,
  stateRef,
  morphPlayPhrases,
  morphTransitionPhrases,
  morphPlayPhrasesRef,
  morphTransitionPhrasesRef,
  morphCapturedStateRef,
  morphCapturedDualRangesRef,
  morphCapturedSliderModesRef,
  morphCapturedDualConfigsRef,
  morphCapturedStartRootRef,
  morphDirectionRef,
  lastMorphEndpointRef,
  morphManualOverridesRef,
  setMorphPosition,
  setState,
  dualConfigs,
  setDualSliderConfigs,
  setMorphCoFViz,
  setMorphCountdown,
  lerpPresets,
  resetCofDrift,
  resetRuntimeWalkPositionsForModes,
  scheduleProductRuntimeParamUpdate,
  isEngineRunning,
  productRuntimeActive,
  productAutoCycleRuntime,
}: UseMorphPositionRuntimeSurfaceOptions<TPreset>): MorphPositionRuntimeSurface {
  const prevMorphPresetARef = useRef<TPreset | null>(null);
  const prevMorphPresetBRef = useRef<TPreset | null>(null);
  const lastMorphPosRef = useRef<number>(0);
  const lastMorphUiPosRef = useRef<number>(0);
  const manualPositionOnEnterRef = useRef<number>(0);
  const currentCofStepRef = useRef<number>(0);
  const morphPlayTimeoutRef = useRef<number | null>(null);
  const currentPhaseRef = useRef<MorphPhase>('hold');
  const phaseStartTimeRef = useRef<number>(Date.now());
  const phaseDurationRef = useRef<number>(0);
  const productAutoCycleInitialPositionRef = useRef(morphPosition);
  const productAutoModulationSideRef = useRef<-1 | 0 | 1>(-1);
  const productAutoConfirmedEndpointPairRef = useRef<ProductAutoModulationEndpointPair | null>(null);
  const productAutoEndpointSnapshotsRef = useRef(new WeakMap<object, ProductAutoModulationEndpointPair>());
  const productAutoLifecycleGenerationRef = useRef(0);
  const productAutoEndpointGenerationRef = useRef(0);
  const applyProductAutoModulationSideRef = useRef<(
    position: number,
    endpointPair: ProductAutoModulationEndpointPair | null,
  ) => void>(() => undefined);
  const lastAppliedManualPositionRef = useRef<number | null>(null);
  const morphInputEmitterRef = useRef<MorphPositionScheduler | null>(null);
  const morphApplyRef = useRef<(position: number, options?: MorphPositionCommitOptions) => void>(() => undefined);
  const lastResolvedMorphRef = useRef<LastResolvedMorph | null>(null);
  const invalidateMorphInputs = useCallback((): void => {
    lastAppliedManualPositionRef.current = null;
    lastResolvedMorphRef.current = null;
    morphInputEmitterRef.current?.reset();
  }, []);
  const previousMorphInputsRef = useRef<{
    presetA: TPreset | null;
    presetB: TPreset | null;
    fallbackState: SliderState | null;
    fallbackDualRanges: Record<string, { min: number; max: number }> | null;
    fallbackSliderModes: Record<string, SliderMode> | null;
    fallbackDualConfigs: Record<string, DualSliderConfig> | null;
  }>({
    presetA: morphPresetA,
    presetB: morphPresetB,
    fallbackState: morphCapturedStateRef.current,
    fallbackDualRanges: morphCapturedDualRangesRef.current,
    fallbackSliderModes: morphCapturedSliderModesRef.current,
    fallbackDualConfigs: morphCapturedDualConfigsRef.current,
  });

  useEffect(() => {
    currentCofStepRef.current = currentCofStep;
  }, [currentCofStep]);

  const buildFallbackPreset = useCallback((): TPreset => {
    const fallbackState = morphCapturedStateRef.current || DEFAULT_STATE;
    const fallbackDualRanges = morphCapturedDualRangesRef.current || undefined;
    const fallbackSliderModes = morphCapturedSliderModesRef.current || undefined;
    const fallbackDualConfigs = morphCapturedDualConfigsRef.current || undefined;
    return {
      name: 'Current',
      timestamp: '',
      state: fallbackState,
      dualRanges: fallbackDualRanges,
      sliderModes: fallbackSliderModes,
      dualSliderConfigs: fallbackDualConfigs,
    } as TPreset;
  }, [morphCapturedDualConfigsRef, morphCapturedDualRangesRef, morphCapturedSliderModesRef, morphCapturedStateRef]);

  const mergeMorphDualRuntime = useCallback((morphResult: MorphRuntimeResult): void => {
    const next: Record<string, DualSliderConfig> = {};
    for (const [key, config] of Object.entries(dualConfigs)) {
      if (config && !(key in morphResult.dualModes)) next[key] = config;
    }
    Object.assign(next, morphResult.dualConfigs);
    setDualSliderConfigs(next);
  }, [dualConfigs, setDualSliderConfigs]);

  useEffect(() => {
    const nextInputs = {
      presetA: morphPresetA,
      presetB: morphPresetB,
      fallbackState: morphCapturedStateRef.current,
      fallbackDualRanges: morphCapturedDualRangesRef.current,
      fallbackSliderModes: morphCapturedSliderModesRef.current,
      fallbackDualConfigs: morphCapturedDualConfigsRef.current,
    };
    const previous = previousMorphInputsRef.current;
    if (
      previous.presetA !== nextInputs.presetA
      || previous.presetB !== nextInputs.presetB
      || previous.fallbackState !== nextInputs.fallbackState
      || previous.fallbackDualRanges !== nextInputs.fallbackDualRanges
      || previous.fallbackSliderModes !== nextInputs.fallbackSliderModes
      || previous.fallbackDualConfigs !== nextInputs.fallbackDualConfigs
    ) {
      invalidateMorphInputs();
    }
    previousMorphInputsRef.current = nextInputs;
  }, [invalidateMorphInputs, morphCapturedDualConfigsRef.current, morphCapturedDualRangesRef.current, morphCapturedSliderModesRef.current, morphCapturedStateRef.current, morphPresetA, morphPresetB]);

  useEffect(() => {
    const presetAChanged = morphPresetA !== prevMorphPresetARef.current;
    const presetBChanged = morphPresetB !== prevMorphPresetBRef.current;

    prevMorphPresetARef.current = morphPresetA;
    prevMorphPresetBRef.current = morphPresetB;

    if (!presetAChanged && !presetBChanged) return;
    if (productRuntimeActive) return;
    if (!morphPresetA && !morphPresetB) return;
    if (!isInMidMorph(morphPosition, true)) return;

    const fallbackPreset = buildFallbackPreset();
    const effectiveA = morphPresetA || fallbackPreset;
    const effectiveB = morphPresetB || fallbackPreset;
    const direction = morphDirectionRef.current || 'toB';
    const morphResult = lerpPresets(effectiveA, effectiveB, morphPosition, currentCofStep, morphCapturedStartRootRef.current ?? undefined, direction);

    let stateWithPrefs = { ...morphResult.state };
    for (const key of USER_PREFERENCE_KEYS) {
      (stateWithPrefs as Record<string, unknown>)[key] = state[key];
    }
    stateWithPrefs = preserveRunningSimpleSequencers(stateWithPrefs, stateRef.current);

    setState((prev) => ({ ...prev, ...stateWithPrefs }));
    scheduleProductRuntimeParamUpdate(stateWithPrefs, { reason: 'morph-control-change' });
    mergeMorphDualRuntime(morphResult);
  }, [
    buildFallbackPreset,
    currentCofStep,
    lerpPresets,
    mergeMorphDualRuntime,
    morphCapturedStartRootRef,
    morphDirectionRef,
    morphPosition,
    morphPresetA,
    morphPresetB,
    scheduleProductRuntimeParamUpdate,
    setState,
    state,
    productRuntimeActive,
  ]);

  const applyMorphPositionChange = useCallback(
    (newPosition: number, options?: { flush?: boolean }) => {
      const nextMorphPosition = clampMorphPosition(newPosition, true);
      const isFlush = options?.flush === true;
      if (!morphPresetA && !morphPresetB) {
        if (!isFlush && lastAppliedManualPositionRef.current === nextMorphPosition) return;
        lastAppliedManualPositionRef.current = nextMorphPosition;
        setMorphPosition(nextMorphPosition);
        return;
      }

      const fallbackPreset = buildFallbackPreset();
      const effectiveA = morphPresetA || fallbackPreset;
      const effectiveB = morphPresetB || fallbackPreset;
      const wasAtA = lastMorphEndpointRef.current === 0;
      const wasAtB = lastMorphEndpointRef.current === 100;
      const leavingA = wasAtA && nextMorphPosition > 0;
      const leavingB = wasAtB && nextMorphPosition < 100;
      const direction = morphDirectionRef.current || (leavingB ? 'toA' : 'toB');
      const capturedStartRoot = morphCapturedStartRootRef.current;
      const liveInputs: MorphResolvedInputs = {
        endpointA: endpointContentRefs(effectiveA),
        endpointB: endpointContentRefs(effectiveB),
        overrides: morphManualOverridesRef.current,
        liveStateValues: captureMorphLiveStateValues(state, stateRef.current),
        currentCofStep,
        capturedStartRoot,
        direction,
      };
      const cached = lastResolvedMorphRef.current;
      if (cached && cached.position === nextMorphPosition && sameMorphResolvedInputs(cached.inputs, liveInputs)) {
        if (!isFlush && lastAppliedManualPositionRef.current === nextMorphPosition) return;
        if (isFlush) {
          scheduleProductRuntimeParamUpdate(cached.state, {
            reason: 'morph-control-change',
            immediate: true,
          });
          return;
        }
      }

      lastAppliedManualPositionRef.current = nextMorphPosition;
      setMorphPosition(nextMorphPosition);

      if (isAtEndpoint0(nextMorphPosition, true)) {
        lastMorphEndpointRef.current = 0;
        morphDirectionRef.current = null;
        morphCapturedStartRootRef.current = null;
      } else if (isAtEndpoint1(nextMorphPosition, true)) {
        lastMorphEndpointRef.current = 100;
        morphDirectionRef.current = null;
        morphCapturedStartRootRef.current = null;
      }

      if (leavingA && morphCapturedStartRootRef.current === null) {
        morphDirectionRef.current = 'toB';
        const stateA = { ...DEFAULT_STATE, ...effectiveA.state };
        morphCapturedStartRootRef.current = stateA.cofDriftEnabled ? calculateDriftedRoot(stateA.rootNote, currentCofStep) : stateA.rootNote;
      } else if (leavingB && morphCapturedStartRootRef.current === null) {
        morphDirectionRef.current = 'toA';
        const stateB = { ...DEFAULT_STATE, ...effectiveB.state };
        morphCapturedStartRootRef.current = stateB.cofDriftEnabled ? calculateDriftedRoot(stateB.rootNote, currentCofStep) : stateB.rootNote;
      }

      const morphResult = lerpPresets(effectiveA, effectiveB, nextMorphPosition, currentCofStep, morphCapturedStartRootRef.current ?? undefined, direction);

      const overrides = morphManualOverridesRef.current;
      let finalState = { ...morphResult.state };
      const endpointStateA = { ...DEFAULT_STATE, ...effectiveA.state };
      const endpointStateB = { ...DEFAULT_STATE, ...effectiveB.state };

      for (const key of USER_PREFERENCE_KEYS) {
        (finalState as unknown as Record<string, unknown>)[key] = state[key];
      }

      for (const [key, override] of Object.entries(overrides)) {
        const typedKey = key as keyof SliderState;
        const lerpedValue = morphResult.state[typedKey];
        if (typeof lerpedValue !== 'number') continue;

        const destValue = direction === 'toB'
          ? (endpointStateB[typedKey] as number)
          : (endpointStateA[typedKey] as number);
        const destPosition = direction === 'toB' ? 100 : 0;

        const overridePos = override.morphPosition;
        const totalDistance = Math.abs(destPosition - overridePos);
        const currentDistance = Math.abs(nextMorphPosition - overridePos);

        if (totalDistance > 0) {
          const progressTowardDest = (direction === 'toB' && nextMorphPosition >= overridePos) || (direction === 'toA' && nextMorphPosition <= overridePos);

          if (progressTowardDest) {
            const blendFactor = Math.min(1, currentDistance / totalDistance);
            const blendedValue = override.value + (destValue - override.value) * blendFactor;
            (finalState as Record<string, unknown>)[key] = blendedValue;
          } else {
            (finalState as Record<string, unknown>)[key] = override.value;
          }
        }
      }

      finalState = preserveRunningSimpleSequencers(finalState, stateRef.current);

      setState(finalState);
      scheduleProductRuntimeParamUpdate(
        finalState,
        isFlush
          ? { reason: 'morph-control-change', immediate: true }
          : { reason: 'morph-control-change' },
      );

      const atEndpoint = isAtEndpoint0(nextMorphPosition, true) || isAtEndpoint1(nextMorphPosition, true);
      setMorphCoFViz(atEndpoint ? null : morphResult.morphCoFInfo || null);

      if (atEndpoint) {
        const targetPreset = isAtEndpoint0(nextMorphPosition, true) ? effectiveA : effectiveB;
        const targetState = { ...DEFAULT_STATE, ...targetPreset.state };
        if (!targetState.cofDriftEnabled) {
          resetCofDrift();
        }
        morphManualOverridesRef.current = {};
      }

      mergeMorphDualRuntime(morphResult);
      resetRuntimeWalkPositionsForModes(morphResult.dualModes);
      lastResolvedMorphRef.current = {
        position: nextMorphPosition,
        inputs: {
          endpointA: endpointContentRefs(effectiveA),
          endpointB: endpointContentRefs(effectiveB),
          overrides: cloneMorphOverrides(morphManualOverridesRef.current),
          liveStateValues: captureMorphLiveStateValues(state, stateRef.current),
          currentCofStep,
          capturedStartRoot: morphCapturedStartRootRef.current,
          direction: morphDirectionRef.current || 'toB',
        },
        state: finalState,
        result: morphResult,
      };
    },
    [
      buildFallbackPreset,
      currentCofStep,
      lastMorphEndpointRef,
      lerpPresets,
      mergeMorphDualRuntime,
      morphCapturedStartRootRef,
      morphDirectionRef,
      morphManualOverridesRef,
      morphPresetA,
      morphPresetB,
      resetCofDrift,
      resetRuntimeWalkPositionsForModes,
      scheduleProductRuntimeParamUpdate,
      setMorphCoFViz,
      setMorphPosition,
      setState,
      state,
    ],
  );

  morphApplyRef.current = applyMorphPositionChange;

  if (!morphInputEmitterRef.current) {
    morphInputEmitterRef.current = createMorphPositionScheduler(
      (position, options) => morphApplyRef.current(position, options),
      (callback) => requestAnimationFrame(callback),
      (frameId) => cancelAnimationFrame(frameId),
    );
  }

  useEffect(() => () => {
    morphInputEmitterRef.current?.cancel();
  }, []);

  const handleMorphPositionChange = useCallback(
    (newPosition: number, options?: { flush?: boolean }) => {
      const nextPosition = clampMorphPosition(newPosition, true);
      const atEndpoint = isAtEndpoint0(nextPosition, true) || isAtEndpoint1(nextPosition, true);
      // Endpoints must update synchronously so preset capture, CoF drift reset, and
      // Product scheduler state are committed before the gesture completes.
      if (options?.flush || atEndpoint) {
        morphInputEmitterRef.current?.flush(nextPosition);
      } else {
        morphInputEmitterRef.current?.schedule(nextPosition);
      }
    },
    [],
  );

  const applyProductAutoModulationSide = useCallback((
    position: number,
    endpointPair: ProductAutoModulationEndpointPair | null,
  ): void => {
    const side: 0 | 1 = position < 0.5 ? 0 : 1;
    if (!endpointPair || productAutoModulationSideRef.current === side) return;
    productAutoModulationSideRef.current = side;

    const endpointResult = lerpPresets(
      endpointPair.endpointA as TPreset,
      endpointPair.endpointB as TPreset,
      side === 0 ? 0 : 100,
      currentCofStepRef.current,
    );

    // The native scene owns continuous parameter interpolation. Modulator
    // definitions and parameter bus assignments are discrete preset metadata,
    // so update them only when the cycle crosses the exact 50% boundary.
    setState((previous) => ({
      ...previous,
      modulationSourceA: endpointResult.state.modulationSourceA,
      modulationSourceB: endpointResult.state.modulationSourceB,
    }));
    mergeMorphDualRuntime(endpointResult);
    resetRuntimeWalkPositionsForModes(endpointResult.dualModes);
  }, [
    lerpPresets,
    mergeMorphDualRuntime,
    resetRuntimeWalkPositionsForModes,
    setState,
  ]);
  applyProductAutoModulationSideRef.current = applyProductAutoModulationSide;

  useEffect(() => {
    if (morphMode !== 'auto') productAutoCycleInitialPositionRef.current = morphPosition;
  }, [morphMode, morphPosition]);

  const buildProductAutoEndpointSnapshotPair = useCallback((presetA: TPreset | null, presetB: TPreset | null): ProductAutoModulationEndpointPair => {
    const fallbackPreset = buildFallbackPreset();
    const effectiveA = presetA || fallbackPreset;
    const effectiveB = presetB || fallbackPreset;
    const currentState = stateRef.current;
    const endpointState = (preset: TPreset): SliderState & Record<string, unknown> => {
      const next = { ...DEFAULT_STATE, ...preset.state } as SliderState & Record<string, unknown>;
      for (const key of USER_PREFERENCE_KEYS) {
        (next as Record<string, unknown>)[key] = currentState[key];
      }
      return next;
    };
    return {
      endpointA: { ...effectiveA, state: endpointState(effectiveA) },
      endpointB: { ...effectiveB, state: endpointState(effectiveB) },
    };
  }, [buildFallbackPreset, stateRef]);
  const rememberProductAutoEndpointSnapshot = useCallback((endpointPair: ProductAutoModulationEndpointPair): ProductAutoCycleEndpointPair => {
    productAutoEndpointSnapshotsRef.current.set(endpointPair.endpointA.state, endpointPair);
    productAutoEndpointSnapshotsRef.current.set(endpointPair.endpointB.state, endpointPair);
    return {
      endpointA: endpointPair.endpointA.state as unknown as ProductAutoCycleEndpointPair['endpointA'],
      endpointB: endpointPair.endpointB.state as unknown as ProductAutoCycleEndpointPair['endpointB'],
    };
  }, []);
  const adoptProductAutoProjection = useCallback((projection: ProductAutoCycleProjection | null): ProductAutoModulationEndpointPair | null => {
    if (!projection?.confirmedEndpointA || !projection.confirmedEndpointB) {
      return productAutoConfirmedEndpointPairRef.current;
    }
    const endpointPair = productAutoEndpointSnapshotsRef.current.get(projection.confirmedEndpointA)
      || productAutoEndpointSnapshotsRef.current.get(projection.confirmedEndpointB);
    if (!endpointPair) return productAutoConfirmedEndpointPairRef.current;
    if (productAutoConfirmedEndpointPairRef.current !== endpointPair) {
      productAutoConfirmedEndpointPairRef.current = endpointPair;
      productAutoModulationSideRef.current = -1;
    }
    return endpointPair;
  }, []);
  const productAutoCycleEnabled = productRuntimeActive &&
    morphMode === 'auto' &&
    isEngineRunning &&
    !!(morphPresetA || morphPresetB);

  useEffect(() => {
    if (!productRuntimeActive) return undefined;
    if (!productAutoCycleEnabled) {
      productAutoConfirmedEndpointPairRef.current = null;
      productAutoLifecycleGenerationRef.current += 1;
      productAutoModulationSideRef.current = -1;
      productAutoCycleRuntime.stop(true);
      setMorphCountdown(null);
      return undefined;
    }

    const endpointSnapshot = buildProductAutoEndpointSnapshotPair(morphPresetA, morphPresetB);
    const endpointPair = rememberProductAutoEndpointSnapshot(endpointSnapshot);
    const abortController = new AbortController();
    const lifecycleGeneration = productAutoLifecycleGenerationRef.current + 1;
    productAutoLifecycleGenerationRef.current = lifecycleGeneration;
    productAutoConfirmedEndpointPairRef.current = null;
    productAutoModulationSideRef.current = -1;
    void productAutoCycleRuntime.start({
      ...endpointPair,
      initialPosition: productAutoCycleInitialPositionRef.current / 100,
      playPhrases: morphPlayPhrasesRef.current,
      transitionPhrases: morphTransitionPhrasesRef.current,
      signal: abortController.signal,
    }).then(() => {
      if (abortController.signal.aborted || productAutoLifecycleGenerationRef.current !== lifecycleGeneration) return;
      const projection = productAutoCycleRuntime.readProjection();
      const confirmedPair = adoptProductAutoProjection(projection);
      if (projection && confirmedPair) applyProductAutoModulationSideRef.current(projection.position, confirmedPair);
    }).catch((error) => {
      if (!abortController.signal.aborted) console.warn('Product auto-cycle assets are not ready:', error);
    });

    return () => {
      abortController.abort();
      productAutoConfirmedEndpointPairRef.current = null;
      productAutoLifecycleGenerationRef.current += 1;
      productAutoCycleRuntime.stop(true);
    };
  }, [
    adoptProductAutoProjection,
    buildProductAutoEndpointSnapshotPair,
    isEngineRunning,
    morphPlayPhrasesRef,
    morphTransitionPhrasesRef,
    productAutoCycleEnabled,
    productAutoCycleRuntime,
    productRuntimeActive,
    rememberProductAutoEndpointSnapshot,
    setMorphCountdown,
  ]);

  const previousProductAutoEndpointRefs = useRef<{
    presetA: TPreset | null;
    presetB: TPreset | null;
    fallbackState: SliderState | null;
    fallbackDualRanges: Record<string, { min: number; max: number }> | null;
    fallbackSliderModes: Record<string, SliderMode> | null;
    fallbackDualConfigs: Record<string, DualSliderConfig> | null;
  }>({
    presetA: morphPresetA,
    presetB: morphPresetB,
    fallbackState: morphCapturedStateRef.current,
    fallbackDualRanges: morphCapturedDualRangesRef.current,
    fallbackSliderModes: morphCapturedSliderModesRef.current,
    fallbackDualConfigs: morphCapturedDualConfigsRef.current,
  });
  useEffect(() => {
    const previous = previousProductAutoEndpointRefs.current;
    const next = {
      presetA: morphPresetA,
      presetB: morphPresetB,
      fallbackState: morphCapturedStateRef.current,
      fallbackDualRanges: morphCapturedDualRangesRef.current,
      fallbackSliderModes: morphCapturedSliderModesRef.current,
      fallbackDualConfigs: morphCapturedDualConfigsRef.current,
    };
    const changed = previous.presetA !== next.presetA
      || previous.presetB !== next.presetB
      || previous.fallbackState !== next.fallbackState
      || previous.fallbackDualRanges !== next.fallbackDualRanges
      || previous.fallbackSliderModes !== next.fallbackSliderModes
      || previous.fallbackDualConfigs !== next.fallbackDualConfigs;
    previousProductAutoEndpointRefs.current = next;
    if (!changed || !productAutoCycleEnabled) return;
    const endpointSnapshot = buildProductAutoEndpointSnapshotPair(morphPresetA, morphPresetB);
    const endpointPair = rememberProductAutoEndpointSnapshot(endpointSnapshot);
    const endpointGeneration = productAutoEndpointGenerationRef.current + 1;
    productAutoEndpointGenerationRef.current = endpointGeneration;
    const lifecycleGeneration = productAutoLifecycleGenerationRef.current;
    // Endpoint content can change while the cycle remains on the same side.
    // Keep the installed metadata until the replacement is confirmed, then
    // refresh from the authoritative native projection without writing UI
    // position back to the native clock.
    void productAutoCycleRuntime.replace(endpointPair).then(() => {
      if (!productAutoCycleEnabled
        || productAutoLifecycleGenerationRef.current !== lifecycleGeneration
        || productAutoEndpointGenerationRef.current !== endpointGeneration) return;
      const projection = productAutoCycleRuntime.readProjection();
      const confirmedPair = adoptProductAutoProjection(projection);
      if (projection && confirmedPair) applyProductAutoModulationSideRef.current(projection.position, confirmedPair);
    }).catch((error) => {
      console.warn('Product auto-cycle endpoint replacement is not ready:', error);
    });
  }, [
    adoptProductAutoProjection,
    buildProductAutoEndpointSnapshotPair,
    morphCapturedDualConfigsRef.current,
    morphCapturedDualRangesRef.current,
    morphCapturedSliderModesRef.current,
    morphCapturedStateRef.current,
    morphPresetA,
    morphPresetB,
    productAutoCycleEnabled,
    productAutoCycleRuntime,
    rememberProductAutoEndpointSnapshot,
  ]);

  useEffect(() => {
    if (!productRuntimeActive || morphMode !== 'auto' || !isEngineRunning) return;
    productAutoCycleRuntime.updateDurations(morphPlayPhrases, morphTransitionPhrases);
  }, [
    isEngineRunning,
    morphMode,
    morphPlayPhrases,
    morphTransitionPhrases,
    productAutoCycleRuntime,
    productRuntimeActive,
  ]);

  useEffect(() => {
    if (!productRuntimeActive || morphMode !== 'auto' || !isEngineRunning || typeof window === 'undefined') {
      return undefined;
    }
    let frame = 0;
    let lastReadMs = 0;
    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState !== 'visible' || now - lastReadMs < 100) return;
      lastReadMs = now;
      const telemetry = productAutoCycleRuntime.readProjection();
      if (!telemetry?.enabled) return;
      const position = Math.round(telemetry.position * 100);
      setMorphPosition(position);
      const confirmedPair = adoptProductAutoProjection(telemetry);
      if (confirmedPair) applyProductAutoModulationSideRef.current(telemetry.position, confirmedPair);
      if (telemetry.sampleRate === null) {
        setMorphCountdown(null);
        return;
      }
      const samplesLeft = Math.max(0, telemetry.phaseEndFrame - telemetry.absoluteSampleTime);
      const phraseSamples = Math.max(
        1,
        (telemetry.phraseSeconds ?? stateRef.current.phraseLength ?? 16) * telemetry.sampleRate,
      );
      const phrasesLeft = Math.ceil(samplesLeft / phraseSamples);
      setMorphCountdown((previous) => (
        previous?.phase === telemetry.phase && previous.phrasesLeft === phrasesLeft
          ? previous
          : { phase: telemetry.phase, phrasesLeft }
      ));
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [
    adoptProductAutoProjection,
    isEngineRunning,
    morphMode,
    productAutoCycleRuntime,
    productRuntimeActive,
    setMorphCountdown,
    setMorphPosition,
    stateRef,
  ]);

  useEffect(() => {
    if (productRuntimeActive) return undefined;
    if (morphMode !== 'auto' || !isEngineRunning || (!morphPresetA && !morphPresetB)) {
      setMorphCountdown(null);
      return;
    }

    const phraseLength = state.phraseLength ?? 16;
    const getPlayDuration = () => morphPlayPhrasesRef.current * phraseLength * 1000;
    const getTransitionDuration = () => morphTransitionPhrasesRef.current * phraseLength * 1000;
    const holdDuration = phraseLength * 1000;

    manualPositionOnEnterRef.current = morphPosition;
    lastMorphPosRef.current = -1;
    lastMorphUiPosRef.current = -1;

    const initialTransitionDuration = getTransitionDuration();
    const fallbackPreset = buildFallbackPreset();
    const effectiveA = morphPresetA || fallbackPreset;
    const effectiveB = morphPresetB || fallbackPreset;
    const startPos = manualPositionOnEnterRef.current;
    const targetAfterHold = startPos <= 50 ? 0 : 100;
    const alreadyAtTarget = (targetAfterHold === 0 && startPos <= 5) || (targetAfterHold === 100 && startPos >= 95);

    if (alreadyAtTarget) {
      currentPhaseRef.current = targetAfterHold === 0 ? 'playA' : 'playB';
      phaseStartTimeRef.current = Date.now();
      phaseDurationRef.current = getPlayDuration();
    } else {
      currentPhaseRef.current = 'hold';
      phaseStartTimeRef.current = Date.now();
      phaseDurationRef.current = holdDuration;
    }

    const transitionToPhase = (phase: MorphPhase) => {
      currentPhaseRef.current = phase;
      phaseStartTimeRef.current = Date.now();

      if (phase === 'playA' || phase === 'playB') {
        phaseDurationRef.current = getPlayDuration();
        morphCapturedStartRootRef.current = null;
        morphDirectionRef.current = null;
        lastMorphEndpointRef.current = phase === 'playA' ? 0 : 100;
      } else if (phase === 'morphAB' || phase === 'morphBA') {
        phaseDurationRef.current = getTransitionDuration();
        morphDirectionRef.current = phase === 'morphAB' ? 'toB' : 'toA';
        const sourcePreset = phase === 'morphAB' ? effectiveA : effectiveB;
        const sourceState = { ...DEFAULT_STATE, ...sourcePreset.state };
        morphCapturedStartRootRef.current = sourceState.cofDriftEnabled ? calculateDriftedRoot(sourceState.rootNote, currentCofStepRef.current) : sourceState.rootNote;
      } else if (phase === 'entry') {
        phaseDurationRef.current = initialTransitionDuration;
        morphDirectionRef.current = targetAfterHold === 100 ? 'toB' : 'toA';
        const sourcePreset = startPos <= 50 ? effectiveA : effectiveB;
        const sourceState = { ...DEFAULT_STATE, ...sourcePreset.state };
        morphCapturedStartRootRef.current = sourceState.cofDriftEnabled ? calculateDriftedRoot(sourceState.rootNote, currentCofStepRef.current) : sourceState.rootNote;
      }
    };

    const cancelMorphPlayLoop = () => {
      if (morphPlayTimeoutRef.current !== null) {
        clearTimeout(morphPlayTimeoutRef.current);
        morphPlayTimeoutRef.current = null;
      }
    };
    let hiddenStartedAt: number | null = document.visibilityState === 'visible' ? null : Date.now();

    const animate = () => {
      const now = Date.now();
      const phaseElapsed = now - phaseStartTimeRef.current;
      const phaseDuration = phaseDurationRef.current;
      const isVisible = document.visibilityState === 'visible';
      const currentState = stateRef.current;

      let newPos: number;
      let phaseName: string;
      let timeLeftInPhase: number;

      switch (currentPhaseRef.current) {
        case 'hold':
          newPos = startPos;
          phaseName = 'Hold';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('entry');
          }
          break;
        case 'entry':
          if (phaseDuration > 0) {
            const t = Math.min(1, phaseElapsed / phaseDuration);
            newPos = Math.round(startPos + (targetAfterHold - startPos) * t);
          } else {
            newPos = targetAfterHold;
          }
          phaseName = targetAfterHold === 0 ? 'Morph → A' : 'Morph → B';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase(targetAfterHold === 0 ? 'playA' : 'playB');
          }
          break;
        case 'playA':
          newPos = 0;
          phaseName = 'Playing A';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('morphAB');
          }
          break;
        case 'morphAB':
          {
            const t = phaseDuration > 0 ? Math.min(1, phaseElapsed / phaseDuration) : 1;
            newPos = Math.round(t * 100);
          }
          phaseName = 'Morph A→B';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('playB');
          }
          break;
        case 'playB':
          newPos = 100;
          phaseName = 'Playing B';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('morphBA');
          }
          break;
        case 'morphBA':
          {
            const t = phaseDuration > 0 ? Math.min(1, phaseElapsed / phaseDuration) : 1;
            newPos = Math.round((1 - t) * 100);
          }
          phaseName = 'Morph B→A';
          timeLeftInPhase = Math.max(0, phaseDuration - phaseElapsed);
          if (phaseElapsed >= phaseDuration) {
            transitionToPhase('playA');
          }
          break;
        default:
          newPos = 0;
          phaseName = 'Unknown';
          timeLeftInPhase = 0;
      }

      const positionChanged = lastMorphPosRef.current !== newPos;
      const shouldSyncUi = isVisible && lastMorphUiPosRef.current !== newPos;

      if (positionChanged) {
        lastMorphPosRef.current = newPos;
      }

      let morphResult: MorphRuntimeResult | null = null;
      let stateWithPrefs: SliderState | null = null;
      if (positionChanged || shouldSyncUi) {
        const direction = morphDirectionRef.current || 'toB';
        morphResult = lerpPresets(effectiveA, effectiveB, newPos, currentCofStepRef.current, morphCapturedStartRootRef.current ?? undefined, direction);
        stateWithPrefs = { ...morphResult.state };
        for (const key of USER_PREFERENCE_KEYS) {
          (stateWithPrefs as unknown as Record<string, unknown>)[key] = currentState[key];
        }
      }

      if (positionChanged && stateWithPrefs) {
        scheduleProductRuntimeParamUpdate(stateWithPrefs, {
          immediate: true,
          reason: 'morph-control-change',
          triggerCritical: true,
        });
        if (isAtEndpoint0(newPos, true) || isAtEndpoint1(newPos, true)) {
          resetCofDrift();
        }
      }

      if (shouldSyncUi) {
        lastMorphUiPosRef.current = newPos;
        setMorphPosition(newPos);
        if (stateWithPrefs && morphResult) {
          setState(stateWithPrefs);

          const atEndpoint = isAtEndpoint0(newPos, true) || isAtEndpoint1(newPos, true);
          setMorphCoFViz(atEndpoint ? null : morphResult.morphCoFInfo || null);
          mergeMorphDualRuntime(morphResult);
          resetRuntimeWalkPositionsForModes(morphResult.dualModes);
        }
      }

      if (isVisible) {
        const phrasesLeft = Math.ceil(timeLeftInPhase / ((currentState.phraseLength ?? 16) * 1000));
        setMorphCountdown((prev) => (prev?.phase === phaseName && prev.phrasesLeft === phrasesLeft ? prev : { phase: phaseName, phrasesLeft }));
      }
    };

    const scheduleNextTick = () => {
      if (!isEngineRunning || document.visibilityState !== 'visible') return;
      morphPlayTimeoutRef.current = window.setTimeout(() => {
        morphPlayTimeoutRef.current = null;
        animate();
        scheduleNextTick();
      }, 100);
    };

    const handleVisibilityChange = () => {
      cancelMorphPlayLoop();
      if (document.visibilityState !== 'visible') {
        hiddenStartedAt = Date.now();
        return;
      }
      if (hiddenStartedAt !== null) {
        phaseStartTimeRef.current += Math.max(0, Date.now() - hiddenStartedAt);
        hiddenStartedAt = null;
      }
      animate();
      scheduleNextTick();
    };

    animate();
    scheduleNextTick();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelMorphPlayLoop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setMorphCountdown(null);
      setMorphCoFViz(null);
    };
  }, [
    buildFallbackPreset,
    isEngineRunning,
    lerpPresets,
    mergeMorphDualRuntime,
    morphCapturedStartRootRef,
    morphDirectionRef,
    morphMode,
    morphPlayPhrasesRef,
    morphPosition,
    morphPresetA,
    morphPresetB,
    morphTransitionPhrasesRef,
    resetCofDrift,
    resetRuntimeWalkPositionsForModes,
    scheduleProductRuntimeParamUpdate,
    setMorphCoFViz,
    setMorphCountdown,
    setMorphPosition,
    setState,
    state.phraseLength,
    stateRef,
    lastMorphEndpointRef,
    productRuntimeActive,
  ]);

  return { handleMorphPositionChange, invalidateMorphInputs };
}
