import { useEffect } from 'react';

import { DRUM_MORPH_KEYS, type SliderMode, type SliderState } from './state';

type ProductRange = { min: number; max: number };

type SelectedAudioEngineRangeSyncOptions = {
  drumMorphKeyToVoice: Record<string, unknown>;
  drumMorphKeys: Set<keyof SliderState>;
  drumSHParamKeys: Set<string>;
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRange | undefined>>;
  selectedRuntimeSupportsRangeKey: (key: string) => boolean;
  setSelectedDrumMorphRange: (voice: unknown, range: ProductRange | null) => void;
  setSelectedDrumParamSHRange: (key: string, range: ProductRange | null) => void;
  setSelectedDualRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
  sliderModes: Record<string, SliderMode>;
};

export function useSelectedAudioEngineRangeSync({
  drumMorphKeyToVoice,
  drumMorphKeys,
  drumSHParamKeys,
  dualSliderRanges,
  selectedRuntimeSupportsRangeKey,
  setSelectedDrumMorphRange,
  setSelectedDrumParamSHRange,
  setSelectedDualRanges,
  sliderModes,
}: SelectedAudioEngineRangeSyncOptions): void {
  useEffect(() => {
    drumMorphKeys.forEach((key) => {
      const voice = drumMorphKeyToVoice[key];
      if (!voice) return;
      const keyStr = key as string;
      if (sliderModes[keyStr] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) {
          setSelectedDrumMorphRange(voice, range);
        }
      } else {
        setSelectedDrumMorphRange(voice, null);
      }
    });
  }, [drumMorphKeyToVoice, drumMorphKeys, dualSliderRanges, setSelectedDrumMorphRange, sliderModes]);

  useEffect(() => {
    drumSHParamKeys.forEach((key) => {
      if (!selectedRuntimeSupportsRangeKey(key)) return;
      if (sliderModes[key] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) {
          setSelectedDrumParamSHRange(key, range);
        }
      } else {
        setSelectedDrumParamSHRange(key, null);
      }
    });
  }, [drumSHParamKeys, dualSliderRanges, selectedRuntimeSupportsRangeKey, setSelectedDrumParamSHRange, sliderModes]);

  useEffect(() => {
    const engineRanges: Partial<Record<string, ProductRange>> = {};
    Object.entries(dualSliderRanges).forEach(([key, range]) => {
      if (!selectedRuntimeSupportsRangeKey(key)) return;
      if (range && !DRUM_MORPH_KEYS.has(key as keyof SliderState) && !drumSHParamKeys.has(key) && sliderModes[key] === 'sampleHold') {
        engineRanges[key] = range;
      }
    });
    setSelectedDualRanges(engineRanges);
  }, [drumSHParamKeys, dualSliderRanges, selectedRuntimeSupportsRangeKey, setSelectedDualRanges, sliderModes]);
}
