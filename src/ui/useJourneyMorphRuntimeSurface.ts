import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { isAtEndpoint0, isAtEndpoint1 } from '../audio/morphUtils';
import type { DualSliderRange } from './DualSlider';
import type { ProductRuntimeParamUpdateOptions } from './useProductRuntimePresetSurface';
import type { SliderMode, SliderState } from './state';
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
  morphCoFInfo?: NonNullable<JourneyMorphCoFViz> | null;
};

type UseJourneyMorphRuntimeSurfaceOptions<TPreset extends JourneyMorphPreset> = {
  journeyPresetARef: MutableRefObject<TPreset | null>;
  journeyPresetBRef: MutableRefObject<TPreset | null>;
  journeyLastAppliedStateRef: MutableRefObject<SliderState | null>;
  journeyLastDualModesRef: MutableRefObject<Record<string, SliderMode>>;
  journeyLastDualRangesRef: MutableRefObject<Partial<Record<keyof SliderState, DualSliderRange>>>;
  journeyLastMorphPositionRef: MutableRefObject<number | null>;
  journeyLastMorphCoFVizRef: MutableRefObject<JourneyMorphCoFViz>;
  setState: Dispatch<SetStateAction<SliderState>>;
  setSliderModes: Dispatch<SetStateAction<Record<string, SliderMode>>>;
  setDualSliderRanges: Dispatch<SetStateAction<Partial<Record<keyof SliderState, DualSliderRange>>>>;
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
    },
  ) => Promise<boolean>;
  lastAppliedPresetLoadRef: MutableRefObject<{
    preset: TPreset;
    state: SliderState;
  } | null>;
  startJourneyPlayback: (state: SliderState, title: string) => Promise<void>;
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
};

type JourneyMorphRuntimeSurface = {
  applyJourneyDualSnapshot: (
    nextDualModes: Record<string, SliderMode>,
    nextDualRanges: Partial<Record<keyof SliderState, DualSliderRange>>,
  ) => void;
  commitJourneyRuntimeState: () => void;
  stopJourneyMorphPlayback: (commitRuntimeState?: boolean) => void;
  handleJourneyLoadPreset: (presetName: string) => Promise<void>;
  handleJourneyMorphTo: (targetPresetName: string, durationPhrases: number) => void;
};

export function useJourneyMorphRuntimeSurface<TPreset extends JourneyMorphPreset>({
  journeyPresetARef,
  journeyPresetBRef,
  journeyLastAppliedStateRef,
  journeyLastDualModesRef,
  journeyLastDualRangesRef,
  journeyLastMorphPositionRef,
  journeyLastMorphCoFVizRef,
  setState,
  setSliderModes,
  setDualSliderRanges,
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
  startJourneyPlayback,
  lerpPresets,
  resetCofDrift,
  scheduleProductRuntimeParamUpdate,
  startJourneyMorphClock,
  stopJourneyMorphClock,
  setIsJourneyPlaying,
}: UseJourneyMorphRuntimeSurfaceOptions<TPreset>): JourneyMorphRuntimeSurface {
  const applyJourneyDualSnapshot = useCallback((nextDualModes: Record<string, SliderMode>, nextDualRanges: Partial<Record<keyof SliderState, DualSliderRange>>) => {
    setSliderModes((prev) => {
      const next: Record<string, SliderMode> = {};
      for (const [key, mode] of Object.entries(prev)) {
        if (!(key in nextDualModes)) {
          next[key] = mode;
        }
      }
      for (const [key, mode] of Object.entries(nextDualModes)) {
        if (mode !== 'single') {
          next[key] = mode;
        }
      }
      return next;
    });
    setDualSliderRanges((prev) => {
      const next: typeof prev = {};
      for (const [key, range] of Object.entries(prev)) {
        if (!(key in nextDualModes)) {
          next[key as keyof SliderState] = range;
        }
      }
      for (const [key, range] of Object.entries(nextDualRanges)) {
        if (range) {
          next[key as keyof SliderState] = range;
        }
      }
      return next;
    });
  }, [setDualSliderRanges, setSliderModes]);

  const commitJourneyRuntimeState = useCallback(() => {
    const nextState = journeyLastAppliedStateRef.current;
    if (nextState) {
      setState(nextState);
    }
    applyJourneyDualSnapshot(journeyLastDualModesRef.current, journeyLastDualRangesRef.current);
    if (journeyLastMorphPositionRef.current !== null) {
      setMorphPosition(journeyLastMorphPositionRef.current);
    }
    setMorphCoFViz(journeyLastMorphCoFVizRef.current);
  }, [
    applyJourneyDualSnapshot,
    journeyLastAppliedStateRef,
    journeyLastDualModesRef,
    journeyLastDualRangesRef,
    journeyLastMorphCoFVizRef,
    journeyLastMorphPositionRef,
    setMorphCoFViz,
    setMorphPosition,
    setState,
  ]);

  const stopJourneyMorphPlayback = useCallback(
    (commitRuntimeState = false) => {
      stopJourneyMorphClock();
      if (commitRuntimeState) {
        commitJourneyRuntimeState();
      }
    },
    [commitJourneyRuntimeState, stopJourneyMorphClock],
  );

  const handleJourneyLoadPreset = useCallback(
    async (presetName: string) => {
      const preset = await resolveSavedPresetByName(presetName);
      if (!preset) {
        console.warn('[Journey] Preset not found:', presetName);
        return;
      }

      console.log('[Journey] Loading preset:', presetName);

      setIsJourneyPlaying(true);

      setMorphPosition(0);
      setMorphPresetB(null);
      setMorphSlotBName('');
      journeyMorphDirectionRef.current = 'toB';

      const loaded = await handleLoadPresetFromList(preset, {
        forceApply: true,
        morphPositionOverride: 0,
        skipJourneyOverridePrompt: true,
      });
      if (!loaded) {
        setIsJourneyPlaying(false);
        return;
      }
      const appliedPresetLoad = lastAppliedPresetLoadRef.current;
      const startPreset = appliedPresetLoad?.preset ?? preset;
      const startState = appliedPresetLoad?.state ?? stateRef.current;
      setStatePresetName(startPreset.name);

      journeyPresetARef.current = startPreset;
      journeyPresetBRef.current = null;
      journeyLastAppliedStateRef.current = startState;
      journeyLastDualModesRef.current = {};
      journeyLastDualRangesRef.current = {};
      journeyLastMorphPositionRef.current = 0;
      journeyLastMorphCoFVizRef.current = null;

      await startJourneyPlayback(startState, startPreset.name);
    },
    [
      handleLoadPresetFromList,
      journeyLastAppliedStateRef,
      journeyLastDualModesRef,
      journeyLastDualRangesRef,
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
    (targetPresetName: string, durationPhrases: number) => {
      void (async () => {
        const preset = await resolveSavedPresetByName(targetPresetName);
        if (!preset) {
          console.warn('[Journey] Target preset not found:', targetPresetName);
          return;
        }

        const direction = journeyMorphDirectionRef.current;
        console.log('[Journey] Morphing to:', targetPresetName, 'over', durationPhrases, 'phrases', 'direction:', direction);

        stopJourneyMorphPlayback(false);

        // Calculate duration in milliseconds using phrase-based timing.
        const msPerPhrase = (phraseLength ?? 16) * 1000;
        const durationMs = durationPhrases * msPerPhrase;

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

        const startTime = performance.now();
        let lastUIUpdate = 0;

        const animateMorph = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / durationMs);

          const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          const rawPosition = startPosition + (endPosition - startPosition) * eased;
          const newPosition = Math.round(rawPosition * 10) / 10;

          const morphResult = lerpPresets(
            animPresetA,
            animPresetB,
            newPosition,
            currentCofStep,
            undefined,
            direction,
          );

          const stateWithPrefs = { ...morphResult.state };
          const currentState = stateRef.current;
          for (const key of USER_PREFERENCE_KEYS) {
            (stateWithPrefs as Record<string, unknown>)[key] = currentState[key];
          }

          const atEndpoint = isAtEndpoint0(newPosition, true) || isAtEndpoint1(newPosition, true);
          const nextMorphCoFViz = atEndpoint ? null : morphResult.morphCoFInfo || null;
          journeyLastAppliedStateRef.current = stateWithPrefs;
          journeyLastDualModesRef.current = morphResult.dualModes;
          journeyLastDualRangesRef.current = morphResult.dualRanges;
          journeyLastMorphPositionRef.current = newPosition;
          journeyLastMorphCoFVizRef.current = nextMorphCoFViz;

          scheduleProductRuntimeParamUpdate(stateWithPrefs, { reason: 'journey-morph-change' });

          const isVisible = document.visibilityState === 'visible';
          const shouldUpdateUI = isVisible && (now - lastUIUpdate >= 66 || progress >= 1);
          if (shouldUpdateUI) {
            lastUIUpdate = now;
            setMorphPosition(newPosition);
            setMorphCoFViz(nextMorphCoFViz);
            if (atEndpoint) {
              resetCofDrift();
            }
          }

          if (progress >= 1) {
            commitJourneyRuntimeState();
            setStatePresetName(preset.name);
            journeyMorphDirectionRef.current = direction === 'toB' ? 'toA' : 'toB';
            stopJourneyMorphPlayback(false);
          }
        };

        startJourneyMorphClock(animateMorph);
      })();
    },
    [
      commitJourneyRuntimeState,
      currentCofStep,
      journeyLastAppliedStateRef,
      journeyLastDualModesRef,
      journeyLastDualRangesRef,
      journeyLastMorphCoFVizRef,
      journeyLastMorphPositionRef,
      journeyMorphDirectionRef,
      journeyPresetARef,
      journeyPresetBRef,
      lerpPresets,
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
