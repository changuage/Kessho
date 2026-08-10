import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { calculateDriftedRoot } from '../audio/harmony';
import { clampMorphPosition, isAtEndpoint0, isAtEndpoint1, isInMidMorph } from '../audio/morphUtils';
import type { DualSliderRange } from './DualSlider';
import type { DualSliderConfig } from './sliderSystem/dualConfigReducer';
import type { ProductRuntimeParamUpdateOptions } from './useProductRuntimePresetSurface';
import { USER_PREFERENCE_KEYS } from './presetUtils';
import { DEFAULT_STATE, type SliderMode, type SliderState } from './state';
import type { ProductAutoCycleRuntimeSurface } from './useProductRuntimeAutoCycleSurface';
import { createMorphPositionScheduler, type MorphPositionScheduler } from './morphPositionRaf';

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

type MorphRuntimeResult = {
  state: SliderState;
  dualRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
  dualModes: Record<string, SliderMode>;
  dualConfigs: Record<string, DualSliderConfig>;
  morphCoFInfo?: NonNullable<MorphCoFViz> | null;
};

type MorphManualOverrides = Record<string, { value: number; morphPosition: number }>;
type MorphCountdown = { phase: string; phrasesLeft: number } | null;
type MorphMode = 'manual' | 'auto';
type MorphPhase = 'hold' | 'entry' | 'playA' | 'morphAB' | 'playB' | 'morphBA';

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
};

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
  const lastAppliedManualPositionRef = useRef<number | null>(null);
  const morphInputEmitterRef = useRef<MorphPositionScheduler | null>(null);
  const morphApplyRef = useRef<(position: number) => void>(() => undefined);

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

    const stateWithPrefs = { ...morphResult.state };
    for (const key of USER_PREFERENCE_KEYS) {
      (stateWithPrefs as Record<string, unknown>)[key] = state[key];
    }

    setState((prev) => ({ ...prev, ...stateWithPrefs }));
    scheduleProductRuntimeParamUpdate(stateWithPrefs, {
      immediate: true,
      reason: 'morph-control-change',
      triggerCritical: true,
    });
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
    (newPosition: number) => {
      const nextMorphPosition = clampMorphPosition(newPosition, true);
      if (lastAppliedManualPositionRef.current === nextMorphPosition) return;
      lastAppliedManualPositionRef.current = nextMorphPosition;
      setMorphPosition(nextMorphPosition);

      if (!morphPresetA && !morphPresetB) return;

      const fallbackPreset = buildFallbackPreset();
      const effectiveA = morphPresetA || fallbackPreset;
      const effectiveB = morphPresetB || fallbackPreset;

      if (morphPresetA && morphPresetB && morphPresetA.name === morphPresetB.name) return;

      const wasAtA = lastMorphEndpointRef.current === 0;
      const wasAtB = lastMorphEndpointRef.current === 100;
      const leavingA = wasAtA && nextMorphPosition > 0;
      const leavingB = wasAtB && nextMorphPosition < 100;

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

      const direction = morphDirectionRef.current || 'toB';
      const morphResult = lerpPresets(effectiveA, effectiveB, nextMorphPosition, currentCofStep, morphCapturedStartRootRef.current ?? undefined, direction);

      const overrides = morphManualOverridesRef.current;
      const finalState = { ...morphResult.state };

      for (const key of USER_PREFERENCE_KEYS) {
        (finalState as unknown as Record<string, unknown>)[key] = state[key];
      }

      for (const [key, override] of Object.entries(overrides)) {
        const typedKey = key as keyof SliderState;
        const lerpedValue = morphResult.state[typedKey];
        if (typeof lerpedValue !== 'number') continue;

        const stateA = { ...DEFAULT_STATE, ...effectiveA.state };
        const stateB = { ...DEFAULT_STATE, ...effectiveB.state };
        const destValue = direction === 'toB' ? (stateB[typedKey] as number) : (stateA[typedKey] as number);
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

      setState(finalState);
      scheduleProductRuntimeParamUpdate(finalState, {
        immediate: true,
        reason: 'morph-control-change',
        triggerCritical: true,
      });

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
      (position) => morphApplyRef.current(position),
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

  const applyProductAutoModulationSide = useCallback((position: number): void => {
    const side: 0 | 1 = position < 0.5 ? 0 : 1;
    if (productAutoModulationSideRef.current === side || (!morphPresetA && !morphPresetB)) return;
    productAutoModulationSideRef.current = side;

    const fallbackPreset = buildFallbackPreset();
    const effectiveA = morphPresetA || fallbackPreset;
    const effectiveB = morphPresetB || fallbackPreset;
    const endpointResult = lerpPresets(
      effectiveA,
      effectiveB,
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
    buildFallbackPreset,
    lerpPresets,
    mergeMorphDualRuntime,
    morphPresetA,
    morphPresetB,
    resetRuntimeWalkPositionsForModes,
    setState,
  ]);

  useEffect(() => {
    if (morphMode !== 'auto') productAutoCycleInitialPositionRef.current = morphPosition;
  }, [morphMode, morphPosition]);

  useEffect(() => {
    if (!productRuntimeActive) return undefined;
    const enabled = morphMode === 'auto' && isEngineRunning && !!(morphPresetA || morphPresetB);
    if (!enabled) {
      productAutoCycleRuntime.stop(true);
      setMorphCountdown(null);
      return undefined;
    }

    const fallbackPreset = buildFallbackPreset();
    const effectiveA = morphPresetA || fallbackPreset;
    const effectiveB = morphPresetB || fallbackPreset;
    const currentState = stateRef.current;
    const endpointState = (preset: TPreset): SliderState & Record<string, unknown> => {
      const next = { ...DEFAULT_STATE, ...preset.state } as SliderState & Record<string, unknown>;
      for (const key of USER_PREFERENCE_KEYS) {
        (next as Record<string, unknown>)[key] = currentState[key];
      }
      return next;
    };
    const endpointA = endpointState(effectiveA);
    const endpointB = endpointState(effectiveB);
    const abortController = new AbortController();
    productAutoModulationSideRef.current = -1;
    void productAutoCycleRuntime.start({
      endpointA,
      endpointB,
      initialPosition: productAutoCycleInitialPositionRef.current / 100,
      playPhrases: morphPlayPhrasesRef.current,
      transitionPhrases: morphTransitionPhrasesRef.current,
      signal: abortController.signal,
    }).catch((error) => {
      if (!abortController.signal.aborted) console.warn('Product auto-cycle assets are not ready:', error);
    });

    return () => {
      abortController.abort();
      productAutoCycleRuntime.stop(false);
    };
  }, [
    buildFallbackPreset,
    isEngineRunning,
    morphMode,
    morphPlayPhrasesRef,
    morphPresetA,
    morphPresetB,
    morphTransitionPhrasesRef,
    productAutoCycleRuntime,
    productRuntimeActive,
    setMorphCountdown,
    stateRef,
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
      applyProductAutoModulationSide(telemetry.position);
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
    applyProductAutoModulationSide,
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
    const samePreset = morphPresetA && morphPresetB && morphPresetA.name === morphPresetB.name;
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
      if (!samePreset && (positionChanged || shouldSyncUi)) {
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

  return { handleMorphPositionChange };
}
