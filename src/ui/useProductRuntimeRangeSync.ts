import { useEffect } from 'react';
import { DRUM_MORPH_KEYS } from './state';
import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes';
import type { SliderMode, SliderState } from './state';

type ProductRuntimeRange = { min: number; max: number };

export type ProductRuntimeRangeSyncOptions = {
  drumMorphKeyToVoice: Record<string, ProductDrumVoice>;
  drumMorphKeys: Set<keyof SliderState>;
  drumSHParamKeys: Set<string>;
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRuntimeRange | undefined>>;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
  setProductDrumMorphRange: (voice: ProductDrumVoice, range: ProductRuntimeRange | null) => void;
  setProductDrumParamSHRange: (key: string, range: ProductRuntimeRange | null) => void;
  setProductDualRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void;
  sliderModes: Record<string, SliderMode>;
};

export function useProductRuntimeRangeSync({
  productRuntimeSupportsRangeKey,
  setProductDrumMorphRange,
  setProductDrumParamSHRange,
  setProductDualRanges,
  ...options
}: ProductRuntimeRangeSyncOptions): void {
  const {
    drumMorphKeyToVoice,
    drumMorphKeys,
    drumSHParamKeys,
    dualSliderRanges,
    sliderModes,
  } = options;
  useEffect(() => {
    drumMorphKeys.forEach((key) => {
      const voice = drumMorphKeyToVoice[key];
      if (!voice) return;
      const keyStr = key as string;
      if (sliderModes[keyStr] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) setProductDrumMorphRange(voice, range);
      } else {
        setProductDrumMorphRange(voice, null);
      }
    });
  }, [drumMorphKeyToVoice, drumMorphKeys, dualSliderRanges, setProductDrumMorphRange, sliderModes]);

  useEffect(() => {
    drumSHParamKeys.forEach((key) => {
      if (!productRuntimeSupportsRangeKey(key)) return;
      if (sliderModes[key] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        if (range) setProductDrumParamSHRange(key, range);
      } else {
        setProductDrumParamSHRange(key, null);
      }
    });
  }, [drumSHParamKeys, dualSliderRanges, productRuntimeSupportsRangeKey, setProductDrumParamSHRange, sliderModes]);

  useEffect(() => {
    const engineRanges: Partial<Record<string, ProductRuntimeRange>> = {};
    Object.entries(dualSliderRanges).forEach(([key, range]) => {
      if (!productRuntimeSupportsRangeKey(key)) return;
      if (range && !DRUM_MORPH_KEYS.has(key as keyof SliderState) && !drumSHParamKeys.has(key) && sliderModes[key] === 'sampleHold') {
        engineRanges[key] = range;
      }
    });
    setProductDualRanges(engineRanges);
  }, [drumSHParamKeys, dualSliderRanges, productRuntimeSupportsRangeKey, setProductDualRanges, sliderModes]);
}
