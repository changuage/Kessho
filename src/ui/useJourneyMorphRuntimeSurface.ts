import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { isAtEndpoint0, isAtEndpoint1 } from '../audio/morphUtils';
import type { DualSliderRange } from './DualSlider';
import { dualSliderConfigsEqual, type DualSliderConfig } from './sliderSystem/dualConfigReducer';
import type { ProductRuntimeParamUpdateOptions } from './useProductRuntimePresetSurface';
import type { SliderMode, SliderState } from './state';
import { collectMorphEndpointStates } from './morphEndpointAssets';
import { prepareSpectralFreezeCaptureForMorph } from './spectralFreezeGesture';
import { USER_PREFERENCE_KEYS } from './presetUtils';

type JourneyMorphCoFViz = {
  isMorphing: boolean;
  startRoot: number;
  effectiveRoot: number;
  targetRoot: number;
  cofStep: number;
  totalSteps: number;
} | null;

type JourneyMorphPreset = {
  name: string;
  state: Partial<SliderState>;
};

type JourneyMorphResult = {
  state: SliderState;
  dualModes: Record<string, SliderMode>;
  dualRanges: Partial<Record<keyof SliderState, DualSliderRange>>;
  dualConfigs: Record<string, DualSliderConfig>;
  morphCoFInfo?: NonNullable<JourneyMorphCoFViz> | null;
};

type UseJourneyMorphRuntimeSurfaceOptions<TPreset extends JourneyMorphPreset> = {
  journeyPresetARef: MutableRefObject<TPreset | null>;
  journeyPresetBRef: MutableRefObject<TPreset | null>;
  journeyLastAppliedStateRef: MutableRefObject<SliderState | null>;
  journeyLastDualModesRef: MutableRefObject<Record<string, SliderMode>>;
  journeyLastDualRangesRef: MutableRefObject<Partial<Record<keyof SliderState, DualSliderRange>>>;
  journeyLastDualConfigsRef: MutableRefObject<Record<string, DualSliderConfig>>;
  journeyLastMorphPositionRef: MutableRefObject<number | null>;
  journeyLastMorphCoFVizRef: MutableRefObject<JourneyMorphCoFViz>;
  setState: Dispatch<SetStateAction<SliderState>>;
  dualConfigs: Record<string, DualSliderConfig | undefined>;
  setDualSliderConfigs: (configs: Record<string, DualSliderConfig>) => void;
  setMorphPresetA: Dispatch<SetStateAction<TPreset | null>>;
  setMorphPresetB: Dispatch<SetStateAction<TPreset | null>>;
  setMorphSlotAName: Dispatch<SetStateAction<string>>;
  setMorphSlotBName: Dispatch<SetStateAction<string>>;
  setMorphPosition: Dispatch<SetStateAction<number>>;
  setMorphCoFViz: Dispatch<SetStateAction<JourneyMorphCoFViz>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  stateRef: MutableRefObject<SliderState>;
  journeyMorphDirectionRef: MutableRefObject<'toB' | 'toA'>;
  phraseLength: number | undefined;
  currentCofStep: number;
  resolveSavedPresetByName: (presetName: string) => Promise<TPreset | null>;
  handleLoadPresetFromList: (
    preset: TPreset,
    options: {
      forceApply: boolean;
      morphPositionOverride: number;
      skipJourneyOverridePrompt: boolean;
      isCurrent?: () => boolean;
    },
  ) => Promise<boolean>;
  lastAppliedPresetLoadRef: MutableRefObject<{
    preset: TPreset;
    state: SliderState;
  } | null>;
  prepareMorphSceneAssets: (states: readonly Record<string, unknown>[]) => Promise<void>;
  startJourneyPlayback: (state: SliderState, title: string, isCurrent?: () => boolean) => Promise<void>;
  lerpPresets: (
    presetA: TPreset,
    presetB: TPreset,
    t: number,
    currentCofStep?: number,
    capturedStartRoot?: number,
    direction?: 'toA' | 'toB',
  ) => JourneyMorphResult;
  resetCofDrift: () => void;
  scheduleProductRuntimeParamUpdate: (nextState: SliderState, options?: ProductRuntimeParamUpdateOptions) => void;
  startJourneyMorphClock: (callback: (now: number) => void) => void;
  stopJourneyMorphClock: () => void;
  setIsJourneyPlaying: Dispatch<SetStateAction<boolean>>;
  onPresetPoolLoad?: (preset: TPreset) => void;
};

type JourneyMorphRuntimeSurface = {
  applyJourneyDualSnapshot: (
    nextDualModes: Record<string, SliderMode>,
    nextDualRanges: Partial<Record<keyof SliderState, DualSliderRange>>,
    nextDualConfigs: Record<string, DualSliderConfig>,
  ) => void;
  commitJourneyRuntimeState: () => void;
  stopJourneyMorphPlayback: (commitRuntimeState?: boolean) => void;
  handleJourneyLoadPreset: (presetName: string, isCurrent: () => boolean) => Promise<void>;
  handleJourneyMorphTo: (targetPresetName: string, durationPhrases: number, durationMs: number, getProgress: () => number) => Promise<void>;
};

export function useJourneyMorphRuntimeSurface<TPreset extends JourneyMorphPreset>({
  journeyPresetARef,
  journeyPresetBRef,
  journeyLastAppliedStateRef,
  journeyLastDualModesRef,
  journeyLastDualRangesRef,
  journeyLastDualConfigsRef,
  journeyLastMorphPositionRef,
  journeyLastMorphCoFVizRef,
  setState,
  dualConfigs,
  setDualSliderConfigs,
  setMorphPresetA,
  setMorphPresetB,
  setMorphSlotAName,
  setMorphSlotBName,
  setMorphPosition,
  setMorphCoFViz,
  setStatePresetName,
  stateRef,
  journeyMorphDirectionRef,
  phraseLength,
  currentCofStep,
  resolveSavedPresetByName,
  handleLoadPresetFromList,
  lastAppliedPresetLoadRef,
  prepareMorphSceneAssets,
  startJourneyPlayback,
  lerpPresets,
  resetCofDrift,
  scheduleProductRuntimeParamUpdate,
  startJourneyMorphClock,
  stopJourneyMorphClock,
  setIsJourneyPlaying,
  onPresetPoolLoad,
}: UseJourneyMorphRuntimeSurfaceOptions<TPreset>): JourneyMorphRuntimeSurface {
  const morphGenerationRef = useRef(0);
  useEffect(() => () => {
    morphGenerationRef.current += 1;
    stopJourneyMorphClock();
  }, [stopJourneyMorphClock]);
  const dualConfigsRef = useRef(dualConfigs);
  dualConfigsRef.current = dualConfigs;
  const applyJourneyDualSnapshot = useCallback((
    nextDualModes: Record<string, SliderMode>,
    _nextDualRanges: Partial<Record<keyof SliderState, DualSliderRange>>,
    nextDualConfigs: Record<string, DualSliderConfig>,
  ) => {
    const next: Record<string, DualSliderConfig> = {};
    for (const [key, config] of Object.entries(dualConfigsRef.current)) {
      if (config && !(key in nextDualModes)) next[key] = config;
    }
    Object.assign(next, nextDualConfigs);
    const previous = dualConfigsRef.current;
    if (Object.keys(previous).length === Object.keys(next).length &&
        Object.entries(next).every(([key, config]) => dualSliderConfigsEqual(previous[key], config))) return;
    dualConfigsRef.current = next;
    setDualSliderConfigs(next);
  }, [setDualSliderConfigs]);

  const commitJourneyRuntimeState = useCallback(() => {
    const nextState = journeyLastAppliedStateRef.current;
    if (nextState) {
      setState(nextState);
    }
    applyJourneyDualSnapshot(
      journeyLastDualModesRef.current,
      journeyLastDualRangesRef.current,
      journeyLastDualConfigsRef.current,
    );
    if (journeyLastMorphPositionRef.current !== null) {
      setMorphPosition(journeyLastMorphPositionRef.current);
    }
    setMorphCoFViz(journeyLastMorphCoFVizRef.current);
  }, [
    applyJourneyDualSnapshot,
    journeyLastAppliedStateRef,
    journeyLastDualModesRef,
    journeyLastDualRangesRef,
    journeyLastDualConfigsRef,
    journeyLastMorphCoFVizRef,
    journeyLastMorphPositionRef,
    setMorphCoFViz,
    setMorphPosition,
    setState,
  ]);

  const stopJourneyMorphPlayback = useCallback(
    (commitRuntimeState = false) => {
      morphGenerationRef.current += 1;
      stopJourneyMorphClock();
      if (commitRuntimeState) {
        commitJourneyRuntimeState();
      }
    },
    [commitJourneyRuntimeState, stopJourneyMorphClock],
  );

  const handleJourneyLoadPreset = useCallback(
    async (presetName: string, isCurrent: () => boolean) => {
      const preset = await resolveSavedPresetByName(presetName);
      if (!isCurrent()) return;
      if (!preset) throw new Error(`Journey preset not found: ${presetName}`);

      console.log('[Journey] Loading preset:', presetName);

      setMorphPosition(0);
      setMorphPresetB(null);
      setMorphSlotBName('');
      journeyMorphDirectionRef.current = 'toB';

      const loaded = await handleLoadPresetFromList(preset, {
        forceApply: true,
        morphPositionOverride: 0,
        skipJourneyOverridePrompt: true,
        isCurrent,
      });
      if (!isCurrent()) return;
      if (!loaded) throw new Error(`Journey preset could not load: ${presetName}`);
      const appliedPresetLoad = lastAppliedPresetLoadRef.current;
      const startPreset = appliedPresetLoad?.preset ?? preset;
      const startState = appliedPresetLoad?.state ?? stateRef.current;
      setStatePresetName(startPreset.name);

      journeyPresetARef.current = startPreset;
      journeyPresetBRef.current = null;
      journeyLastAppliedStateRef.current = startState;
      journeyLastDualModesRef.current = {};
      journeyLastDualRangesRef.current = {};
      journeyLastDualConfigsRef.current = {};
      journeyLastMorphPositionRef.current = 0;
      journeyLastMorphCoFVizRef.current = null;

      await startJourneyPlayback(startState, startPreset.name, isCurrent);
      if (isCurrent()) {
        journeyLastAppliedStateRef.current = stateRef.current;
        setIsJourneyPlaying(true);
      }
    },
    [
      handleLoadPresetFromList,
      journeyLastAppliedStateRef,
      journeyLastDualModesRef,
      journeyLastDualRangesRef,
      journeyLastDualConfigsRef,
      journeyLastMorphCoFVizRef,
      journeyLastMorphPositionRef,
      journeyMorphDirectionRef,
      journeyPresetARef,
      journeyPresetBRef,
      lastAppliedPresetLoadRef,
      resolveSavedPresetByName,
      setIsJourneyPlaying,
      setMorphPosition,
      setMorphPresetB,
      setMorphSlotBName,
      setStatePresetName,
      startJourneyPlayback,
      stateRef,
    ],
  );

  const handleJourneyMorphTo = useCallback(
    async (targetPresetName: string, durationPhrases: number, durationMs: number, getProgress: () => number) => {
      stopJourneyMorphPlayback(false);
      const generation = morphGenerationRef.current;
      try {
        const preset = await resolveSavedPresetByName(targetPresetName);
        if (!preset) throw new Error(`Journey target preset not found: ${targetPresetName}`);

        if (generation !== morphGenerationRef.current) return;
        await prepareMorphSceneAssets(collectMorphEndpointStates(preset, journeyMorphDirectionRef.current === 'toB' ? journeyPresetARef.current : journeyPresetBRef.current));
        if (generation !== morphGenerationRef.current) return;
        const direction = journeyMorphDirectionRef.current;
        console.log('[Journey] Morphing to:', targetPresetName, 'over', durationPhrases, 'phrases', 'direction:', direction);

        console.log('[Journey] Morph duration:', durationMs, 'ms (', durationPhrases, 'phrases x', phraseLength ?? 16, 's)');

        // Direction determines whether the target preset is staged into A or B.
        const startPosition = direction === 'toB' ? 0 : 100;
        const endPosition = direction === 'toB' ? 100 : 0;

        if (direction === 'toB') {
          journeyPresetBRef.current = preset;
          setMorphPresetB(preset);
          setMorphSlotBName(preset.name);
        } else {
          journeyPresetARef.current = preset;
          setMorphPresetA(preset);
          setMorphSlotAName(preset.name);
        }

        const animPresetA = journeyPresetARef.current;
        const animPresetB = journeyPresetBRef.current;

        if (!animPresetA || !animPresetB) {
          console.warn('[Journey] Missing preset for morph. A:', animPresetA?.name, 'B:', animPresetB?.name);
          return;
        }

        let lastUIUpdate = 0;
        let lastRuntimeUpdate = -Infinity;
        let lastPosition: number | null = null;

        const animateMorph = (now: number) => {
          if (generation !== morphGenerationRef.current) return;
          const progress = Math.max(0, Math.min(1, getProgress()));

          const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          const rawPosition = startPosition + (endPosition - startPosition) * eased;
          const newPosition = Math.round(rawPosition * 10) / 10;

          if (now - lastRuntimeUpdate < 33 && progress < 1) return;
          if (newPosition === lastPosition && progress < 1) return;
          lastRuntimeUpdate = now;
          lastPosition = newPosition;

          const morphResult = lerpPresets(
            animPresetA,
            animPresetB,
            newPosition,
            currentCofStep,
            undefined,
            direction,
          );

          const stateWithPrefs = prepareSpectralFreezeCaptureForMorph(morphResult.state, journeyLastAppliedStateRef.current ?? stateRef.current);
          const currentState = stateRef.current;
          for (const key of USER_PREFERENCE_KEYS) {
            (stateWithPrefs as unknown as Record<string, unknown>)[key] = currentState[key];
          }

          const atEndpoint = isAtEndpoint0(newPosition, true) || isAtEndpoint1(newPosition, true);
          const nextMorphCoFViz = atEndpoint ? null : morphResult.morphCoFInfo || null;
          journeyLastAppliedStateRef.current = stateWithPrefs;
          journeyLastDualModesRef.current = morphResult.dualModes;
          journeyLastDualRangesRef.current = morphResult.dualRanges;
          journeyLastDualConfigsRef.current = morphResult.dualConfigs;
          journeyLastMorphPositionRef.current = newPosition;
          journeyLastMorphCoFVizRef.current = nextMorphCoFViz;

          scheduleProductRuntimeParamUpdate(stateWithPrefs, { reason: 'journey-morph-change' });

          const isVisible = document.visibilityState === 'visible';
          const shouldUpdateUI = isVisible && (now - lastUIUpdate >= 66 || progress >= 1);
          if (shouldUpdateUI) {
            lastUIUpdate = now;
            setState(stateWithPrefs);
            applyJourneyDualSnapshot(morphResult.dualModes, morphResult.dualRanges, morphResult.dualConfigs);
            setMorphPosition(newPosition);
            setMorphCoFViz(nextMorphCoFViz);
            if (atEndpoint) {
              resetCofDrift();
            }
          }

          if (progress >= 1) {
            commitJourneyRuntimeState();
            setStatePresetName(preset.name);
            onPresetPoolLoad?.(preset);
            journeyMorphDirectionRef.current = direction === 'toB' ? 'toA' : 'toB';
            stopJourneyMorphPlayback(false);
          }
        };

        startJourneyMorphClock(animateMorph);
      } catch (error) {
        if (generation !== morphGenerationRef.current) return;
        console.error('[Journey] Morph failed:', error);
        stopJourneyMorphPlayback(true);
        setIsJourneyPlaying(false);
        throw error;
      }
    },
    [
      applyJourneyDualSnapshot,
      prepareMorphSceneAssets,
      setIsJourneyPlaying,
      commitJourneyRuntimeState,
      currentCofStep,
      journeyLastAppliedStateRef,
      journeyLastDualModesRef,
      journeyLastDualRangesRef,
      journeyLastDualConfigsRef,
      journeyLastMorphCoFVizRef,
      journeyLastMorphPositionRef,
      journeyMorphDirectionRef,
      journeyPresetARef,
      journeyPresetBRef,
      lerpPresets,
      onPresetPoolLoad,
      phraseLength,
      resetCofDrift,
      resolveSavedPresetByName,
      scheduleProductRuntimeParamUpdate,
      setMorphCoFViz,
      setMorphPosition,
      setMorphPresetA,
      setMorphPresetB,
      setMorphSlotAName,
      setMorphSlotBName,
      setStatePresetName,
      startJourneyMorphClock,
      stateRef,
      stopJourneyMorphPlayback,
    ],
  );

  return {
    applyJourneyDualSnapshot,
    commitJourneyRuntimeState,
    stopJourneyMorphPlayback,
    handleJourneyLoadPreset,
    handleJourneyMorphTo,
  };
}
