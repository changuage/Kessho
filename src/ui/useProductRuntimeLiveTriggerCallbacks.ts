import type { MutableRefObject } from 'react';

import { useSelectedAudioEngineLiveTriggerCallbacks } from './useSelectedAudioEngineLiveTriggerCallbacks';
import type { SliderState } from './state';

type ProductRuntimeLiveTriggerActiveTab =
  | 'global'
  | 'visualizer'
  | 'synth'
  | 'drums'
  | 'reverb'
  | 'granular'
  | 'earth'
  | 'delay'
  | 'dynamics'
  | 'routing';
type ProductRuntimeLiveTriggerUiMode = 'snowflake' | 'advanced' | 'journey';

export type ProductRuntimeLiveTriggerCallbacksOptions = {
  activeTab: ProductRuntimeLiveTriggerActiveTab;
  setProductDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setProductDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
  setProductGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setProductLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => void;
  setProductLeadDistanceCallback: (callback: ((distance: { lead1: number; lead2: number }) => void) | null) => void;
  setProductLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void;
  setProductLeadMorphCallback: (callback: ((morph: { lead1: number; lead2: number }) => void) | null) => void;
  setProductPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setProductPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setProductPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setProductPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  stateRef: MutableRefObject<SliderState>;
  uiMode: ProductRuntimeLiveTriggerUiMode;
};

export function useProductRuntimeLiveTriggerCallbacks({
  setProductDrumMorphTriggerCallback,
  setProductDrumParamSHTriggerCallback,
  setProductGranularSHTriggerCallback,
  setProductLeadDelayCallback,
  setProductLeadDistanceCallback,
  setProductLeadExpressionCallback,
  setProductLeadMorphCallback,
  setProductPad2DistanceTriggerCallback,
  setProductPad2MorphTriggerCallback,
  setProductPadDistanceTriggerCallback,
  setProductPadMorphTriggerCallback,
  setProductPianoDistanceTriggerCallback,
  ...options
}: ProductRuntimeLiveTriggerCallbacksOptions): void {
  // TODO(product-runtime-compat-10E): live trigger registration still delegates to the
  // selected-runtime compatibility hook until source/FX callbacks are product-owned.
  useSelectedAudioEngineLiveTriggerCallbacks({
    ...options,
    setSelectedDrumMorphTriggerCallback: setProductDrumMorphTriggerCallback,
    setSelectedDrumParamSHTriggerCallback: setProductDrumParamSHTriggerCallback,
    setSelectedGranularSHTriggerCallback: setProductGranularSHTriggerCallback,
    setSelectedLeadDelayCallback: setProductLeadDelayCallback,
    setSelectedLeadDistanceCallback: setProductLeadDistanceCallback,
    setSelectedLeadExpressionCallback: setProductLeadExpressionCallback,
    setSelectedLeadMorphCallback: setProductLeadMorphCallback,
    setSelectedPad2DistanceTriggerCallback: setProductPad2DistanceTriggerCallback,
    setSelectedPad2MorphTriggerCallback: setProductPad2MorphTriggerCallback,
    setSelectedPadDistanceTriggerCallback: setProductPadDistanceTriggerCallback,
    setSelectedPadMorphTriggerCallback: setProductPadMorphTriggerCallback,
    setSelectedPianoDistanceTriggerCallback: setProductPianoDistanceTriggerCallback,
  });
}
