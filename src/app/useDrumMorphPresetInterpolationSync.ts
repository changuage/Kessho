import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { applyMorphToState } from '../audio/drumMorph';
import { DrumVoiceType as DrumPresetVoice } from '../audio/drumPresets';
import { isInMidMorph } from '../audio/morphUtils';
import { getProductDrumMorphDualRangeOverrides, interpolateProductDrumMorphDualRanges, type ProductDrumMorphOverrideState } from '../product-control';
import type { ProductRuntimeParamUpdateOptions } from '../ui/useProductRuntimePresetSurface';
import type { SliderMode, SliderState } from '../ui/state';
import { preserveRunningDrumSequencerSource } from './drumSequencerSourcePolicy';
import type { DualSliderState } from './nativeDualRanges';

const DRUM_MORPH_PRESET_VOICES: DrumPresetVoice[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];

const DRUM_MORPH_PRESET_KEYS: Record<DrumPresetVoice, { a: keyof SliderState; b: keyof SliderState; morph: keyof SliderState }> = {
  sub: { a: 'drumSubPresetA', b: 'drumSubPresetB', morph: 'drumSubMorph' },
  kick: { a: 'drumKickPresetA', b: 'drumKickPresetB', morph: 'drumKickMorph' },
  click: { a: 'drumClickPresetA', b: 'drumClickPresetB', morph: 'drumClickMorph' },
  beepHi: { a: 'drumBeepHiPresetA', b: 'drumBeepHiPresetB', morph: 'drumBeepHiMorph' },
  beepLo: { a: 'drumBeepLoPresetA', b: 'drumBeepLoPresetB', morph: 'drumBeepLoMorph' },
  noise: { a: 'drumNoisePresetA', b: 'drumNoisePresetB', morph: 'drumNoiseMorph' },
  membrane: { a: 'drumMembranePresetA', b: 'drumMembranePresetB', morph: 'drumMembraneMorph' },
};

type UseDrumMorphPresetInterpolationSyncOptions = {
  readonly state: SliderState;
  readonly stateRef: MutableRefObject<SliderState>;
  readonly setState: Dispatch<SetStateAction<SliderState>>;
  readonly setSliderModes: Dispatch<SetStateAction<Record<string, SliderMode>>>;
  readonly setDualSliderRanges: Dispatch<SetStateAction<DualSliderState>>;
  readonly getCurrentDrumMorphOverrideState: (sourceState?: SliderState) => ProductDrumMorphOverrideState;
  readonly scheduleProductRuntimeParamUpdate: (nextState: SliderState, options?: ProductRuntimeParamUpdateOptions) => void;
};

export function useDrumMorphPresetInterpolationSync({
  state,
  stateRef,
  setState,
  setSliderModes,
  setDualSliderRanges,
  getCurrentDrumMorphOverrideState,
  scheduleProductRuntimeParamUpdate,
}: UseDrumMorphPresetInterpolationSyncOptions): void {
  const previousDrumPresetsRef = useRef<Record<string, string>>({});
  const drumPresetFingerprint = useMemo(
    () => DRUM_MORPH_PRESET_VOICES
      .map((voice) => {
        const keys = DRUM_MORPH_PRESET_KEYS[voice];
        return `${state[keys.a]}|${state[keys.b]}`;
      })
      .join('|'),
    [
      state.drumSubPresetA,
      state.drumSubPresetB,
      state.drumKickPresetA,
      state.drumKickPresetB,
      state.drumClickPresetA,
      state.drumClickPresetB,
      state.drumBeepHiPresetA,
      state.drumBeepHiPresetB,
      state.drumBeepLoPresetA,
      state.drumBeepLoPresetB,
      state.drumNoisePresetA,
      state.drumNoisePresetB,
      state.drumMembranePresetA,
      state.drumMembranePresetB,
    ],
  );

  useEffect(() => {
    let nextResolvedState: SliderState | null = null;
    for (const voice of DRUM_MORPH_PRESET_VOICES) {
      const keys = DRUM_MORPH_PRESET_KEYS[voice];
      const currentState: SliderState = nextResolvedState ?? stateRef.current;
      const presetA = currentState[keys.a] as string;
      const presetB = currentState[keys.b] as string;
      const morphValue = currentState[keys.morph] as number;

      const presetAChanged = presetA !== previousDrumPresetsRef.current[keys.a];
      const presetBChanged = presetB !== previousDrumPresetsRef.current[keys.b];
      previousDrumPresetsRef.current[keys.a] = presetA;
      previousDrumPresetsRef.current[keys.b] = presetB;

      if (!presetAChanged && !presetBChanged) continue;
      if (!isInMidMorph(morphValue)) continue;

      const drumMorphOverrideState = getCurrentDrumMorphOverrideState(currentState);
      const morphedParams = applyMorphToState(currentState, voice, drumMorphOverrideState);
      nextResolvedState = { ...currentState, ...morphedParams };

      const currentValues: Record<string, number> = {};
      const overrides = getProductDrumMorphDualRangeOverrides(drumMorphOverrideState, voice);
      for (const param of Object.keys(overrides)) {
        const stateVal = currentState[param as keyof SliderState];
        if (typeof stateVal === 'number') {
          currentValues[param] = stateVal;
        }
      }

      const interpolatedRanges = interpolateProductDrumMorphDualRanges(
        drumMorphOverrideState,
        voice,
        morphValue,
        currentValues,
      );

      for (const [param, interpState] of Object.entries(interpolatedRanges)) {
        const paramKey = param as keyof SliderState;
        if (interpState.isDualMode && interpState.range) {
          setSliderModes((prev) => ({
            ...prev,
            [paramKey as string]: prev[paramKey as string] ?? 'sampleHold',
          }));
          setDualSliderRanges((prev) => ({
            ...prev,
            [paramKey]: interpState.range!,
          }));
        } else {
          setSliderModes((prev) => {
            const next = { ...prev };
            delete next[paramKey as string];
            return next;
          });
          setDualSliderRanges((prev) => {
            const { [paramKey]: _discarded, ...rest } = prev;
            return rest as typeof prev;
          });
        }
      }
    }

    if (!nextResolvedState) return;
    const currentState = stateRef.current;
    const liveResolvedState = preserveRunningDrumSequencerSource(currentState, nextResolvedState);
    setState(liveResolvedState);
    scheduleProductRuntimeParamUpdate(liveResolvedState, {
      immediate: true,
      reason: 'morph-control-change',
      triggerCritical: true,
    });
  }, [
    drumPresetFingerprint,
    getCurrentDrumMorphOverrideState,
    scheduleProductRuntimeParamUpdate,
    setDualSliderRanges,
    setSliderModes,
    setState,
    stateRef,
  ]);
}
