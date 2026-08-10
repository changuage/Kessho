import { useEffect } from 'react';
import { DRUM_MORPH_KEYS } from './state';
import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes';
import type { SliderMode, SliderState } from './state';
import { selectEligibleRuntimeRanges } from './runtimeModulationEligibility';

type ProductRuntimeRange = { min: number; max: number };

export type ProductRuntimeRangeSyncOptions = {
  drumMorphKeyToVoice: Record<string, ProductDrumVoice>;
  drumMorphKeys: Set<keyof SliderState>;
  drumSHParamKeys: Set<string>;
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRuntimeRange | undefined>>;
  isRuntimeRangeKeyEligible?: (key: string) => boolean;
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
    isRuntimeRangeKeyEligible = () => true,
    sliderModes,
  } = options;
  useEffect(() => {
    drumMorphKeys.forEach((key) => {
      const voice = drumMorphKeyToVoice[key];
      if (!voice) return;
      const keyStr = key as string;
      if (!isRuntimeRangeKeyEligible(keyStr)) {
        setProductDrumMorphRange(voice, null);
      } else if (sliderModes[keyStr] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        setProductDrumMorphRange(voice, range ?? null);
      } else {
        setProductDrumMorphRange(voice, null);
      }
    });
  }, [drumMorphKeyToVoice, drumMorphKeys, dualSliderRanges, isRuntimeRangeKeyEligible, setProductDrumMorphRange, sliderModes]);

  useEffect(() => {
    drumSHParamKeys.forEach((key) => {
      if (!productRuntimeSupportsRangeKey(key)) return;
      if (!isRuntimeRangeKeyEligible(key)) {
        setProductDrumParamSHRange(key, null);
      } else if (sliderModes[key] === 'sampleHold') {
        const range = dualSliderRanges[key as keyof SliderState];
        setProductDrumParamSHRange(key, range ?? null);
      } else {
        setProductDrumParamSHRange(key, null);
      }
    });
  }, [drumSHParamKeys, dualSliderRanges, isRuntimeRangeKeyEligible, productRuntimeSupportsRangeKey, setProductDrumParamSHRange, sliderModes]);

  useEffect(() => {
    const engineRanges = selectEligibleRuntimeRanges(
      dualSliderRanges as Partial<Record<string, ProductRuntimeRange>>,
      sliderModes,
      'sampleHold',
      isRuntimeRangeKeyEligible,
      productRuntimeSupportsRangeKey,
    );
    for (const key of Object.keys(engineRanges)) {
      if (DRUM_MORPH_KEYS.has(key as keyof SliderState) || drumSHParamKeys.has(key)) delete engineRanges[key];
    }
    setProductDualRanges(engineRanges);
  }, [drumSHParamKeys, dualSliderRanges, isRuntimeRangeKeyEligible, productRuntimeSupportsRangeKey, setProductDualRanges, sliderModes]);
}
